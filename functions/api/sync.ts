import { json, withErrors } from "../_core/http";
import type { RouteContext } from "../_core/request";
import { requireAuth } from "./_auth";
import { syncAndMaybePublish } from "../_core/sync";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  const result = await syncAndMaybePublish(ctx.env);
  return json(result);
});
