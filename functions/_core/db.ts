/**
 * Minimal wrapper around SpaceFast's env.DB (D1-shaped API over MySQL/MariaDB).
 *
 * Single-user design: one fixed owner id ("owner") replaces the Supabase
 * auth.users UUID. Timestamps are epoch milliseconds stored as BIGINT.
 */

export interface DbStatement {
  bind(...params: unknown[]): DbResult;
}

export interface DbResult {
  all(): Promise<{ results: Record<string, unknown>[] }>;
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<unknown>;
}

export interface SpacefastDb {
  prepare(sql: string): DbStatement;
}

/** The single owner id used in place of auth.users ids. */
export const OWNER_ID = "owner";

function toDbValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export function q(db: SpacefastDb, sql: string, ...params: unknown[]): DbResult {
  return db.prepare(sql).bind(...params.map(toDbValue));
}

export async function all(
  db: SpacefastDb,
  sql: string,
  ...params: unknown[]
): Promise<Record<string, unknown>[]> {
  const res = await q(db, sql, ...params).all();
  return res.results ?? [];
}

export async function first(
  db: SpacefastDb,
  sql: string,
  ...params: unknown[]
): Promise<Record<string, unknown> | null> {
  return (await q(db, sql, ...params).first()) ?? null;
}

export async function run(db: SpacefastDb, sql: string, ...params: unknown[]): Promise<void> {
  await q(db, sql, ...params).run();
}

const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(64) PRIMARY KEY,
    tweet_username TEXT NULL,
    tweet_display_name TEXT NULL,
    tweet_avatar_url TEXT NULL,
    auto_post TINYINT NOT NULL DEFAULT 0,
    skip_replies TINYINT NOT NULL DEFAULT 1,
    skip_quotes TINYINT NOT NULL DEFAULT 0,
    long_post_mode VARCHAR(16) NOT NULL DEFAULT 'truncate',
    watch_since BIGINT NULL,
    last_synced_at BIGINT NULL,
    active_x_environment VARCHAR(16) NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS x_credentials (
    user_id VARCHAR(64) NOT NULL,
    environment VARCHAR(16) NOT NULL,
    api_key_ct MEDIUMTEXT NOT NULL,
    api_secret_ct MEDIUMTEXT NOT NULL,
    access_token_ct MEDIUMTEXT NOT NULL,
    access_secret_ct MEDIUMTEXT NOT NULL,
    api_key_hint VARCHAR(64) NOT NULL,
    x_username VARCHAR(64) NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS synced_posts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    source_post_id VARCHAR(128) NOT NULL,
    source_text MEDIUMTEXT NOT NULL,
    source_created_at BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    x_post_id VARCHAR(64) NULL,
    error TEXT NULL,
    posted_at BIGINT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY uq_synced_posts_user_source (user_id, source_post_id),
    KEY idx_synced_posts_user_status (user_id, status)
  )`,
  `CREATE TABLE IF NOT EXISTS tweet_app_credentials (
    user_id VARCHAR(64) PRIMARY KEY,
    token_ct MEDIUMTEXT NOT NULL,
    token_hint VARCHAR(64) NULL,
    needs_reconnect TINYINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
];

let schemaPromise: Promise<void> | null = null;

/**
 * Creates the worker tables when they do not exist yet. Idempotent and safe
 * to call on every request; the DDL only runs once per isolate.
 */
export function ensureSchema(db: SpacefastDb): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const sql of SCHEMA_STATEMENTS) {
        await db.prepare(sql).run();
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

/** Generates a random id suitable for primary keys. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
