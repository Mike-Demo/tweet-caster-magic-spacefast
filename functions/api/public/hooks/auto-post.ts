import { apiError, json, withErrors } from "../../../_core/http";
import { initRequest, type RouteContext } from "../../../_core/request";
import { runScheduledSync } from "../../../_core/sync";

/**
 * Public auto-post webhook (kept at the original path). Authorized with a
 * Bearer AUTO_POST_JOB_SECRET; unauthenticated requests get a 401.
 */
export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const jobSecret = ctx.env.AUTO_POST_JOB_SECRET;
  const presented = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];

  let authorized = false;
  if (jobSecret && presented && presented.length === jobSecret.length) {
    let diff = 0;
    for (let i = 0; i < presented.length; i++) {
      diff |= presented.charCodeAt(i) ^ jobSecret.charCodeAt(i);
    }
    authorized = diff === 0;
  }

  if (!authorized) {
    return apiError(401, "unauthorized", "Unauthorized");
  }

  const result = await runScheduledSync(ctx.env);
  return json({ success: true, ...result });
});
