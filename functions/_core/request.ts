/**
 * Per-request context for SpaceFast function routes.
 */
import { ensureSchema, type SpacefastDb } from "./db";

export interface CoreEnv {
  db: SpacefastDb;
  /** Password guarding the dashboard. Required. */
  DASHBOARD_PASSWORD?: string | undefined;
  /** Raw secret for AES-GCM credential encryption (SHA-256 derived). Required. */
  X_CRED_ENCRYPTION_KEY?: string | undefined;
  /** HMAC secret for signing session cookies. Falls back to the encryption key. */
  SESSION_SECRET?: string | undefined;
  /** Bearer secret for the public auto-post webhook. Optional. */
  AUTO_POST_JOB_SECRET?: string | undefined;
}

export interface CoreContext {
  env: CoreEnv;
  /** Caller IP as resolved from proxy headers, or "unknown". */
  ip: string;
}

export interface RouteContext {
  params: Record<string, string | string[] | undefined>;
  env: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getClientIp(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip");
  if (direct) return direct;
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export async function initRequest(request: Request, context: RouteContext): Promise<CoreContext> {
  const rawDb = context.env["DB"];
  if (!rawDb || typeof (rawDb as { prepare?: unknown }).prepare !== "function") {
    throw new Error("The database binding (env.DB) is not configured for this space.");
  }
  const db = rawDb as SpacefastDb;
  await ensureSchema(db);
  return {
    env: {
      db,
      DASHBOARD_PASSWORD: asString(context.env["DASHBOARD_PASSWORD"]),
      X_CRED_ENCRYPTION_KEY: asString(context.env["X_CRED_ENCRYPTION_KEY"]),
      SESSION_SECRET: asString(context.env["SESSION_SECRET"]),
      AUTO_POST_JOB_SECRET: asString(context.env["AUTO_POST_JOB_SECRET"]),
    },
    ip: getClientIp(request),
  };
}
