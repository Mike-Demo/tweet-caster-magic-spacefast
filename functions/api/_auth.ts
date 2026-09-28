/**
 * Shared helper for dashboard routes: initializes the request and requires
 * a valid session cookie. Throws AuthError (401) when not authenticated.
 */
import { AuthError } from "../_core/http";
import { initRequest, type CoreContext, type RouteContext } from "../_core/request";
import { isAuthenticated } from "../_core/auth";

export async function requireAuth(
  request: Request,
  context: RouteContext,
): Promise<CoreContext> {
  const ctx = await initRequest(request, context);
  if (!(await isAuthenticated(request, ctx.env))) {
    throw new AuthError();
  }
  return ctx;
}
