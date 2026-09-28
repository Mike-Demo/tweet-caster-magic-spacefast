import { InputError, json, withErrors } from "../../../_core/http";
import type { RouteContext } from "../../../_core/request";
import { requireAuth } from "../../_auth";
import { OWNER_ID, run } from "../../../_core/db";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  const params = context.params as Record<string, string | string[] | undefined>;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) throw new InputError("missing_post", "Missing post.");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const status = (raw as { status?: unknown })?.status === "skipped" ? "skipped" : "pending";

  await run(
    ctx.env.db,
    `UPDATE synced_posts SET status = ?, error = NULL WHERE id = ? AND user_id = ?`,
    status,
    id,
    OWNER_ID,
  );
  return json({ ok: true });
});
