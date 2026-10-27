/**
 * MySQL connection pool (mysql2/promise) — no ORM anywhere in this codebase.
 * All data access goes through parameterised queries to prevent SQL injection.
 */
import { noteWrite } from '@/lib/auth/auth-cache';
import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';

/** Values accepted as bound SQL parameters. */
/** Values accepted as bound SQL parameters (kept permissive at the call site). */
export type SqlParam = string | number | boolean | Date | Buffer | null | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: Pool | undefined;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createPool(): Pool {
  return mysql.createPool({
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(required('DB_PORT', '3306')),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    dateStrings: ['DATE', 'DATETIME'],
    supportBigNumbers: true,
    bigNumberStrings: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    multipleStatements: false,
  });
}

/** Singleton pool. Cached on globalThis so Next.js HMR doesn't leak connections. */
export function getPool(): Pool {
  if (!global.__mysqlPool) {
    global.__mysqlPool = createPool();
  }
  return global.__mysqlPool;
}

/**
 * SELECT returning many rows.
 * `params` is cast at the driver boundary: mysql2's overloads narrow the array
 * type, but every call site passes scalar values (string | number | Date | null).
 */
export async function query<T = RowDataPacket>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params as never);
  noteWrite(sql); // a few callers run UPDATEs through query(); it is a no-op for SELECTs
  return rows as unknown as T[];
}

/** SELECT returning a single row or null. */
export async function queryOne<T = RowDataPacket>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Scalar helper: COUNT(*), SUM(x), EXISTS … */
export async function queryScalar<T = number>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
  const row = await queryOne<RowDataPacket>(sql, params);
  if (!row) return null;
  const values = Object.values(row);
  return (values[0] as T) ?? null;
}

/** INSERT / UPDATE / DELETE returning affected rows and insert id. */
export async function execute(sql: string, params: readonly unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params as never);
  noteWrite(sql);
  return result;
}

/** INSERT helper — returns the new auto-increment id. */
export async function insert(sql: string, params: readonly unknown[] = []): Promise<number> {
  const result = await execute(sql, params);
  return result.insertId;
}

/** Run a callback inside a transaction; rolls back on any thrown error. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Health probe used by /admin/settings and the readiness endpoint. */
export async function pingDatabase(): Promise<{ ok: boolean; version?: string; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const row = await queryOne<RowDataPacket>('SELECT VERSION() AS version');
    return { ok: true, version: String(row?.version ?? 'unknown'), latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: (error as Error).message };
  }
}

export async function closePool(): Promise<void> {
  if (global.__mysqlPool) {
    await global.__mysqlPool.end();
    global.__mysqlPool = undefined;
  }
}

export type { Pool, PoolConnection, RowDataPacket, ResultSetHeader };
