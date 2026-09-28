import { json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { isAuthenticated } from "../../_core/auth";

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const authenticated = await isAuthenticated(request, ctx.env);
  return json({ authenticated });
});
