import { InputError, json, withErrors } from "../_core/http";
import type { RouteContext } from "../_core/request";
import { requireAuth } from "./_auth";
import { all, first, OWNER_ID, run } from "../_core/db";
import { encryptSecret } from "../_core/crypto";
import { verifyXCredentials } from "../_core/x";

const ENVIRONMENTS = ["development", "staging", "production"] as const;

function parseEnvironment(value: unknown): string {
  const environment = String(value ?? "");
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new InputError("invalid_environment", "Pick Development, Staging or Production.");
  }
  return environment;
}

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const body = (raw ?? {}) as {
    environment?: unknown;
    apiKey?: unknown;
    apiSecret?: unknown;
    accessToken?: unknown;
    accessSecret?: unknown;
  };
  const environment = parseEnvironment(body.environment);
  const apiKey = String(body.apiKey ?? "").trim();
  const apiSecret = String(body.apiSecret ?? "").trim();
  const accessToken = String(body.accessToken ?? "").trim();
  const accessSecret = String(body.accessSecret ?? "").trim();
  if ([apiKey, apiSecret, accessToken, accessSecret].some((v) => v.length < 10)) {
    throw new InputError("invalid_credentials", "All four values from your X developer app are required.");
  }

  const account = await verifyXCredentials({ apiKey, apiSecret, accessToken, accessSecret });
  const key = ctx.env.X_CRED_ENCRYPTION_KEY;
  const now = Date.now();
  const db = ctx.env.db;

  await run(
    db,
    `INSERT INTO x_credentials
       (user_id, environment, api_key_ct, api_secret_ct, access_token_ct, access_secret_ct,
        api_key_hint, x_username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       api_key_ct = VALUES(api_key_ct), api_secret_ct = VALUES(api_secret_ct),
       access_token_ct = VALUES(access_token_ct), access_secret_ct = VALUES(access_secret_ct),
       api_key_hint = VALUES(api_key_hint), x_username = VALUES(x_username),
       updated_at = VALUES(updated_at)`,
    OWNER_ID,
    environment,
    await encryptSecret(apiKey, key),
    await encryptSecret(apiSecret, key),
    await encryptSecret(accessToken, key),
    await encryptSecret(accessSecret, key),
    `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`,
    account.username,
    now,
    now,
  );

  // Only one set of keys is kept; saving replaces any set stored under another mode.
  await run(db, `DELETE FROM x_credentials WHERE user_id = ? AND environment != ?`, OWNER_ID, environment);
  await run(db, `UPDATE profiles SET active_x_environment = ?, updated_at = ? WHERE id = ?`,
    environment, now, OWNER_ID);

  return json({ xUsername: account.username, environment });
});

export const DELETE = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await requireAuth(request, context);
  const url = new URL(request.url);
  const environment = parseEnvironment(url.searchParams.get("environment"));
  const db = ctx.env.db;

  await run(db, `DELETE FROM x_credentials WHERE user_id = ? AND environment = ?`, OWNER_ID, environment);

  const remaining = await all(db, `SELECT environment FROM x_credentials WHERE user_id = ?`, OWNER_ID);
  const profile = await first(db, `SELECT active_x_environment FROM profiles WHERE id = ?`, OWNER_ID);
  if (profile?.active_x_environment === environment) {
    const fallback = remaining[0]?.environment ?? null;
    await run(db, `UPDATE profiles SET active_x_environment = ?, updated_at = ? WHERE id = ?`,
      fallback, Date.now(), OWNER_ID);
  }

  return json({ ok: true });
});
