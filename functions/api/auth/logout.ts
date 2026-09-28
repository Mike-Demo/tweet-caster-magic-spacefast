import { json, withErrors } from "../../_core/http";
import type { RouteContext } from "../../_core/request";
import { clearSessionCookie } from "../../_core/auth";

export const POST = withErrors(async (_request: Request, _context: RouteContext): Promise<Response> => {
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
});
