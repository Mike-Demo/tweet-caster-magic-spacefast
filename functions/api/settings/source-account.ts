import { InputError, json, withErrors } from "../../_core/http";
import type { RouteContext } from "../../_core/request";
import { requireAuth } from "../_auth";
import { OWNER_ID, run } from "../../_core/db";
import { loadTweetAppToken } from "../../_core/sync";
import { fetchTweetAppProfile } from "../../_core/tweetapp";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const username = String((raw as { username?: unknown })?.username ?? "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(username)) {
    throw new InputError("invalid_username", "That username doesn't look right.");
  }

  const token = await loadTweetAppToken(ctx.env);
  if (!token) throw new InputError("no_tweet_app_token", "Connect your tweet.app account first.");

  const profile = await fetchTweetAppProfile(username, token);
  if (!profile) throw new InputError("profile_not_found", `No tweet.app account found for @${username}.`);

  const now = Date.now();
  await run(
    ctx.env.db,
    `UPDATE profiles SET tweet_username = ?, tweet_display_name = ?, tweet_avatar_url = ?,
       watch_since = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`,
    profile.username,
    profile.displayName,
    profile.avatarUrl,
    now,
    now,
    now,
    OWNER_ID,
  );

  return json({ username: profile.username, displayName: profile.displayName });
});
