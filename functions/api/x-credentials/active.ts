import { InputError, json, withErrors } from "../../_core/http";
import type { RouteContext } from "../../_core/request";
import { requireAuth } from "../_auth";
import { first, OWNER_ID, run } from "../../_core/db";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const environment = String((raw as { environment?: unknown })?.environment ?? "");
  if (!["development", "staging", "production"].includes(environment)) {
    throw new InputError("invalid_environment", "Pick Development, Staging or Production.");
  }

  const row = await first(
    ctx.env.db,
    `SELECT environment FROM x_credentials WHERE user_id = ? AND environment = ?`,
    OWNER_ID,
    environment,
  );
  if (!row) throw new InputError("not_connected", "Add keys for that environment first.");

  await run(ctx.env.db, `UPDATE profiles SET active_x_environment = ?, updated_at = ? WHERE id = ?`,
    environment, Date.now(), OWNER_ID);

  return json({ environment });
});
