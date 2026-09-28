import { InputError, json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { checkPassword, createSessionCookie } from "../../_core/auth";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const password = (raw as { password?: unknown })?.password;
  if (typeof password !== "string" || password.length === 0) {
    throw new InputError("missing_password", "Enter your dashboard password.");
  }
  if (!checkPassword(ctx.env, password)) {
    throw new InputError("invalid_password", "That password didn't work.");
  }
  const cookie = await createSessionCookie(ctx.env);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
});
