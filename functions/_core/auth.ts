/**
 * Single-password dashboard auth. The password comes from the
 * DASHBOARD_PASSWORD secret; a successful login sets an httpOnly cookie
 * holding `expiry.hmac`, where hmac = HMAC-SHA256(sessionSecret, expiry).
 * No user accounts, no MFA — this is a personal tool.
 */
import type { CoreEnv } from "./request";

const COOKIE_NAME = "crosspost_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function sessionSecret(env: CoreEnv): string {
  return env.SESSION_SECRET ?? env.X_CRED_ENCRYPTION_KEY ?? env.DASHBOARD_PASSWORD ?? "";
}

async function sign(env: CoreEnv, expiry: string): Promise<string> {
  const key = await hmacKey(sessionSecret(env));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiry));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function checkPassword(env: CoreEnv, password: string): boolean {
  const expected = env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < password.length; i++) {
    diff |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionCookie(env: CoreEnv): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  const sig = await sign(env, expiry);
  return `${COOKIE_NAME}=${expiry}.${sig}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export async function isAuthenticated(request: Request, env: CoreEnv): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookie);
  if (!match) return false;
  const [expiry, sig] = (match[1] ?? "").split(".");
  if (!expiry || !sig) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = await sign(env, expiry);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
