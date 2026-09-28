import { InputError, json, withErrors } from "../../_core/http";
import type { RouteContext } from "../../_core/request";
import { requireAuth } from "../_auth";
import { OWNER_ID, run } from "../../_core/db";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const body = (raw ?? {}) as {
    autoPost?: unknown;
    skipReplies?: unknown;
    skipQuotes?: unknown;
    longPostMode?: unknown;
  };
  const longPostMode = body.longPostMode === "skip" ? "skip" : "truncate";

  await run(
    ctx.env.db,
    `UPDATE profiles SET auto_post = ?, skip_replies = ?, skip_quotes = ?,
       long_post_mode = ?, updated_at = ? WHERE id = ?`,
    Boolean(body.autoPost),
    Boolean(body.skipReplies),
    Boolean(body.skipQuotes),
    longPostMode,
    Date.now(),
    OWNER_ID,
  );

  return json({ ok: true });
});
