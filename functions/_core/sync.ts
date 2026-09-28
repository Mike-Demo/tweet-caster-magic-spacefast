/**
 * Sync engine: pulls new tweet.app posts into the queue and publishes
 * pending posts to X. Ported from the Supabase implementation to D1.
 */
import { all, first, newId, OWNER_ID, run, type SpacefastDb } from "./db";
import { decryptSecret } from "./crypto";
import { TweetAppAuthError, fetchPostsByAuthor } from "./tweetapp";
import { fitToX, postToX, X_MAX_CHARACTERS, XApiError, type XCredentials } from "./x";
import type { CoreEnv } from "./request";

export interface SyncResult {
  readonly imported: number;
  readonly posted: number;
  readonly failed: number;
  readonly message: string;
}

interface Profile {
  tweet_username: string | null;
  tweet_display_name: string | null;
  tweet_avatar_url: string | null;
  auto_post: number;
  skip_replies: number;
  skip_quotes: number;
  long_post_mode: string;
  watch_since: number | null;
  last_synced_at: number | null;
  active_x_environment: string | null;
}

async function getProfile(db: SpacefastDb): Promise<Profile | null> {
  const row = await first(db, `SELECT * FROM profiles WHERE id = ?`, OWNER_ID);
  if (!row) return null;
  return row as unknown as Profile;
}

async function ensureProfile(db: SpacefastDb): Promise<void> {
  const now = Date.now();
  await run(
    db,
    `INSERT INTO profiles (id, auto_post, skip_replies, skip_quotes, long_post_mode, created_at, updated_at)
     VALUES (?, 0, 1, 0, 'truncate', ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    OWNER_ID,
    now,
    now,
  );
}

export async function loadCredentials(env: CoreEnv): Promise<XCredentials | null> {
  const db = env.db;
  const profile = await getProfile(db);
  if (!profile?.active_x_environment) return null;

  const row = await first(
    db,
    `SELECT api_key_ct, api_secret_ct, access_token_ct, access_secret_ct
     FROM x_credentials WHERE user_id = ? AND environment = ?`,
    OWNER_ID,
    profile.active_x_environment,
  );
  if (!row) return null;

  const key = env.X_CRED_ENCRYPTION_KEY;
  return {
    apiKey: await decryptSecret(String(row.api_key_ct), key),
    apiSecret: await decryptSecret(String(row.api_secret_ct), key),
    accessToken: await decryptSecret(String(row.access_token_ct), key),
    accessSecret: await decryptSecret(String(row.access_secret_ct), key),
  };
}

/** Reads the owner's tweet.app access token, decrypted for server use. */
export async function loadTweetAppToken(env: CoreEnv): Promise<string | null> {
  const row = await first(
    env.db,
    `SELECT token_ct FROM tweet_app_credentials WHERE user_id = ?`,
    OWNER_ID,
  );
  if (!row) return null;
  return decryptSecret(String(row.token_ct), env.X_CRED_ENCRYPTION_KEY);
}

/** Flags the tweet.app connection as needing reconnect, so we stop retrying it. */
export async function markTweetAppReconnect(db: SpacefastDb, needed: boolean): Promise<void> {
  await run(
    db,
    `UPDATE tweet_app_credentials SET needs_reconnect = ?, updated_at = ? WHERE user_id = ?`,
    needed,
    Date.now(),
    OWNER_ID,
  );
}

/** Pulls new tweet.app posts into the queue. Never records the same post twice. */
export async function importNewPosts(env: CoreEnv): Promise<number> {
  const db = env.db;
  const profile = await getProfile(db);
  if (!profile?.tweet_username) return 0;

  const token = await loadTweetAppToken(env);
  if (!token) {
    throw new TweetAppAuthError(
      401,
      "Connect your tweet.app account first — tweet.app now requires a token to read posts.",
      true,
    );
  }

  const sinceMs = profile.last_synced_at ?? profile.watch_since ?? Date.now();
  let posts;
  try {
    posts = await fetchPostsByAuthor(profile.tweet_username, new Date(sinceMs).toISOString(), token);
    await markTweetAppReconnect(db, false);
  } catch (cause) {
    if (cause instanceof TweetAppAuthError && cause.needsReconnect) {
      await markTweetAppReconnect(db, true);
    }
    throw cause;
  }

  const now = Date.now();
  let imported = 0;
  for (const post of posts) {
    if (profile.skip_replies && post.isReply) continue;
    if (profile.skip_quotes && post.isQuote) continue;
    if (post.text.trim().length === 0) continue;
    try {
      await run(
        db,
        `INSERT INTO synced_posts
           (id, user_id, source_post_id, source_text, source_created_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        newId(),
        OWNER_ID,
        post.id,
        post.text,
        new Date(post.createdAt).getTime(),
        now,
      );
      imported += 1;
    } catch {
      // Duplicate (user_id, source_post_id): already queued, skip.
    }
  }

  const newest = posts.at(-1)?.createdAt;
  await run(db, `UPDATE profiles SET last_synced_at = ?, updated_at = ? WHERE id = ?`,
    newest ? new Date(newest).getTime() : now, now, OWNER_ID);

  return imported;
}

/** Sends every pending post to X, oldest first. */
export async function publishPending(
  env: CoreEnv,
  limit = 10,
): Promise<{ posted: number; failed: number }> {
  const db = env.db;
  const profile = await getProfile(db);

  const pending = await all(
    db,
    `SELECT id, source_text FROM synced_posts
     WHERE user_id = ? AND status = 'pending'
     ORDER BY source_created_at ASC LIMIT ?`,
    OWNER_ID,
    limit,
  );
  if (pending.length === 0) return { posted: 0, failed: 0 };

  const credentials = await loadCredentials(env);
  if (!credentials) throw new Error("No X keys saved yet.");

  let posted = 0;
  let failed = 0;

  for (const row of pending) {
    const text = String(row.source_text);
    const tooLong = Array.from(text).length > X_MAX_CHARACTERS;
    if (tooLong && profile?.long_post_mode === "skip") {
      await run(db, `UPDATE synced_posts SET status = 'skipped', error = ? WHERE id = ?`,
        "Longer than X allows.", String(row.id));
      continue;
    }

    try {
      const result = await postToX(credentials, fitToX(text));
      await run(
        db,
        `UPDATE synced_posts SET status = 'posted', x_post_id = ?, posted_at = ?, error = NULL WHERE id = ?`,
        result.id,
        Date.now(),
        String(row.id),
      );
      posted += 1;
    } catch (cause) {
      failed += 1;
      const message = cause instanceof Error ? cause.message : "Posting failed.";
      const rateLimited = cause instanceof XApiError && cause.status === 429;
      await run(
        db,
        `UPDATE synced_posts SET status = ?, error = ? WHERE id = ?`,
        rateLimited ? "pending" : "failed",
        message,
        String(row.id),
      );
      if (rateLimited) break;
    }
  }

  return { posted, failed };
}

export async function syncAndMaybePublish(env: CoreEnv, forcePublish = false): Promise<SyncResult> {
  await ensureProfile(env.db);
  const imported = await importNewPosts(env);

  const profile = await getProfile(env.db);
  if (!forcePublish && !profile?.auto_post) {
    return {
      imported,
      posted: 0,
      failed: 0,
      message: imported > 0 ? `${imported} new post(s) waiting for your review.` : "No new posts.",
    };
  }

  const { posted, failed } = await publishPending(env);
  return {
    imported,
    posted,
    failed,
    message: `${imported} imported, ${posted} sent to X${failed > 0 ? `, ${failed} failed` : ""}.`,
  };
}

/** Used by the scheduled job: runs the whole loop when auto-posting is on. */
export async function runScheduledSync(env: CoreEnv): Promise<{ posted: number }> {
  const db = env.db;
  const profile = await getProfile(db);
  if (!profile?.auto_post || !profile.tweet_username) return { posted: 0 };

  const credRow = await first(
    db,
    `SELECT needs_reconnect FROM tweet_app_credentials WHERE user_id = ?`,
    OWNER_ID,
  );
  if (credRow && Number(credRow.needs_reconnect) === 1) return { posted: 0 };

  try {
    const result = await syncAndMaybePublish(env);
    return { posted: result.posted };
  } catch (cause) {
    console.error("scheduled sync failed", cause);
    return { posted: 0 };
  }
}

export { ensureProfile, getProfile };
