import { InputError, json, withErrors } from "../../../_core/http";
import type { RouteContext } from "../../../_core/request";
import { requireAuth } from "../../_auth";
import { first, OWNER_ID, run } from "../../../_core/db";
import { fitToX, postToX } from "../../../_core/x";
import { loadCredentials } from "../../../_core/sync";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  const params = context.params as Record<string, string | string[] | undefined>;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) throw new InputError("missing_post", "Missing post.");

  const row = await first(
    ctx.env.db,
    `SELECT id, source_text FROM synced_posts WHERE id = ? AND user_id = ?`,
    id,
    OWNER_ID,
  );
  if (!row) throw new InputError("not_found", "That post is no longer in your queue.");

  const credentials = await loadCredentials(ctx.env);
  if (!credentials) throw new InputError("no_x_keys", "Add your X keys first.");

  try {
    const result = await postToX(credentials, fitToX(String(row.source_text)));
    await run(
      ctx.env.db,
      `UPDATE synced_posts SET status = 'posted', x_post_id = ?, posted_at = ?, error = NULL WHERE id = ?`,
      result.id,
      Date.now(),
      String(row.id),
    );
    return json({ xPostId: result.id });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Posting failed.";
    await run(ctx.env.db, `UPDATE synced_posts SET status = 'failed', error = ? WHERE id = ?`,
      message, String(row.id));
    throw new InputError("post_failed", message);
  }
});
