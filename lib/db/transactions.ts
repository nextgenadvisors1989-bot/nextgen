/**
 * Transaction helpers. Every multi-table write in this platform funnels through
 * withTransaction so partial writes can never be committed.
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { noteWrite } from '@/lib/auth/auth-cache';
import { transaction } from './mysql';

export type TxCallback<T> = (tx: TxClient) => Promise<T>;

/** Thin, typed wrapper around a pooled connection inside an open transaction. */
export class TxClient {
  constructor(public readonly conn: PoolConnection) {}

  async query<T = RowDataPacket>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const [rows] = await this.conn.query<RowDataPacket[]>(sql, params as never);
    return rows as unknown as T[];
  }

  async queryOne<T = RowDataPacket>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length ? rows[0] : null;
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<ResultSetHeader> {
    const [result] = await this.conn.execute<ResultSetHeader>(sql, params as never);
    noteWrite(sql);
    return result;
  }

  async insert(sql: string, params: readonly unknown[] = []): Promise<number> {
    return (await this.execute(sql, params)).insertId;
  }

  async scalar<T = number>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const row = await this.queryOne<RowDataPacket>(sql, params);
    if (!row) return null;
    return (Object.values(row)[0] as T) ?? null;
  }

  async lockForUpdate(table: string, id: number): Promise<RowDataPacket | null> {
    return this.queryOne(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
  }
}

export async function withTransaction<T>(fn: TxCallback<T>): Promise<T> {
  return transaction(async (conn) => fn(new TxClient(conn)));
}

/** Retries deadlock (1213) / lock-wait timeout (1205) with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 100): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = (error as { errno?: number }).errno;
      const retryable = code === 1213 || code === 1205;
      if (!retryable || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
