import { json, withErrors } from "../_core/http";
import type { RouteContext } from "../_core/request";
import { requireAuth } from "./_auth";
import { all, first, OWNER_ID } from "../_core/db";
import { ensureProfile } from "../_core/sync";

export const X_ENVIRONMENTS = ["development", "staging", "production"] as const;

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  const db = ctx.env.db;
  await ensureProfile(db);

  const profile = await first(db, `SELECT * FROM profiles WHERE id = ?`, OWNER_ID);
  const posts = await all(
    db,
    `SELECT id, source_text, source_created_at, status, x_post_id, error, posted_at
     FROM synced_posts WHERE user_id = ? ORDER BY source_created_at DESC LIMIT 200`,
    OWNER_ID,
  );
  const credentialRows = await all(
    db,
    `SELECT environment, api_key_hint, x_username FROM x_credentials WHERE user_id = ?`,
    OWNER_ID,
  );
  const tweetAppRow = await first(
    db,
    `SELECT token_hint, needs_reconnect FROM tweet_app_credentials WHERE user_id = ?`,
    OWNER_ID,
  );

  return json({
    settings: {
      tweetUsername: profile?.tweet_username ?? null,
      tweetDisplayName: profile?.tweet_display_name ?? null,
      tweetAvatarUrl: profile?.tweet_avatar_url ?? null,
      autoPost: Number(profile?.auto_post ?? 0) === 1,
      skipReplies: Number(profile?.skip_replies ?? 1) === 1,
      skipQuotes: Number(profile?.skip_quotes ?? 0) === 1,
      longPostMode: profile?.long_post_mode ?? "truncate",
      lastSyncedAt: profile?.last_synced_at
        ? new Date(Number(profile.last_synced_at)).toISOString()
        : null,
    },
    activeEnvironment: profile?.active_x_environment ?? null,
    credentials: X_ENVIRONMENTS.map((environment) => {
      const row = credentialRows.find((r) => r.environment === environment);
      return {
        environment,
        connected: Boolean(row),
        hint: row?.api_key_hint ?? null,
        xUsername: row?.x_username ?? null,
      };
    }),
    tweetApp: {
      connected: Boolean(tweetAppRow),
      hint: tweetAppRow?.token_hint ?? null,
      needsReconnect: Number(tweetAppRow?.needs_reconnect ?? 0) === 1,
    },
    posts: posts.map((row) => ({
      id: String(row.id),
      sourceText: String(row.source_text),
      sourceCreatedAt: new Date(Number(row.source_created_at)).toISOString(),
      status: String(row.status),
      xPostId: row.x_post_id ? String(row.x_post_id) : null,
      error: row.error ? String(row.error) : null,
      postedAt: row.posted_at ? new Date(Number(row.posted_at)).toISOString() : null,
    })),
  });
});
