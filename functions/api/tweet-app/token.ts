import { InputError, json, withErrors } from "../../_core/http";
import type { RouteContext } from "../../_core/request";
import { requireAuth } from "../_auth";
import { first, OWNER_ID, run } from "../../_core/db";
import { encryptSecret } from "../../_core/crypto";
import { fetchTweetAppProfile, TweetAppAuthError } from "../../_core/tweetapp";
import { loadTweetAppToken, markTweetAppReconnect } from "../../_core/sync";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const token = String((raw as { token?: unknown })?.token ?? "").trim().replace(/^Bearer\s+/i, "");
  if (token.length < 16) {
    throw new InputError("invalid_token", "That doesn't look like a tweet.app access token.");
  }

  const profile = await first(ctx.env.db, `SELECT tweet_username FROM profiles WHERE id = ?`, OWNER_ID);
  // Confirm the token works before storing it.
  await fetchTweetAppProfile(String(profile?.tweet_username ?? "demo"), token);

  const now = Date.now();
  await run(
    ctx.env.db,
    `INSERT INTO tweet_app_credentials (user_id, token_ct, token_hint, needs_reconnect, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON DUPLICATE KEY UPDATE token_ct = VALUES(token_ct), token_hint = VALUES(token_hint),
       needs_reconnect = 0, updated_at = VALUES(updated_at)`,
    OWNER_ID,
    await encryptSecret(token, ctx.env.X_CRED_ENCRYPTION_KEY),
    `${token.slice(0, 4)}…${token.slice(-4)}`,
    now,
    now,
  );

  return json({ ok: true });
});

export const DELETE = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  await run(ctx.env.db, `DELETE FROM tweet_app_credentials WHERE user_id = ?`, OWNER_ID);
  return json({ ok: true });
});

export async function testConnection(request: Request, context: RouteContext): Promise<Response> {
  return withErrors(async (req: Request, ctx2: RouteContext): Promise<Response> => {
    const ctx = await requireAuth(req, ctx2);
    const db = ctx.env.db;
    const token = await loadTweetAppToken(ctx.env);
    if (!token) throw new InputError("no_tweet_app_token", "Connect your tweet.app account first.");

    const profile = await first(db, `SELECT tweet_username FROM profiles WHERE id = ?`, OWNER_ID);
    try {
      const result = await fetchTweetAppProfile(String(profile?.tweet_username ?? "demo"), token);
      await markTweetAppReconnect(db, false);
      return json({
        ok: true,
        username: result?.username ?? null,
        message: result
          ? `Connected — tweet.app answered for @${result.username}.`
          : "Connected — tweet.app accepted your token.",
      });
    } catch (cause) {
      if (cause instanceof TweetAppAuthError && cause.needsReconnect) {
        await markTweetAppReconnect(db, true);
      }
      throw cause instanceof Error ? cause : new Error("tweet.app test failed.");
    }
  })(request, context);
}
