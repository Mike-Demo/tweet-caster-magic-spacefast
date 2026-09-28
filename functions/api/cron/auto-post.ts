import { json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { runScheduledSync } from "../../_core/sync";

/**
 * Hit by the SpaceFast platform scheduler (sf.jsonc crons). Runs the whole
 * auto-post loop for the owner when auto-posting is on.
 */
const handler = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const result = await runScheduledSync(ctx.env);
  return json({ ok: true, ...result });
});

export const GET = handler;
export const POST = handler;
