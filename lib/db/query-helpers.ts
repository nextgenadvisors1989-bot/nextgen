/**
 * Builders that keep SQL assembly safe: identifiers are whitelisted, values are
 * always bound as parameters.
 */
import { query, queryOne, queryScalar, type RowDataPacket } from './mysql';

export type SqlValue = string | number | boolean | Date | null | undefined;
export type WhereClause = { sql: string; params: SqlValue[] };

export interface ListQuery {
  page?: number | string | null;
  limit?: number | string | null;
  search?: string | null;
  sortBy?: string | null;
  sortDir?: string | null;
  searchColumns?: string[];
  allowedSortColumns?: string[];
  defaultSort?: string;
}

export interface PagedResult<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number; from: number; to: number };
}

/** Escapes LIKE wildcards so user input cannot widen a match. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function buildSearch(search: string | null | undefined, columns: string[], params: SqlValue[]): string {
  if (!search || !search.trim() || columns.length === 0) return '';
  const term = `%${escapeLike(search.trim())}%`;
  const clauses = columns.map((col) => {
    params.push(term);
    return `${col} LIKE ?`;
  });
  return ` AND (${clauses.join(' OR ')})`;
}

/** Whitelist-driven ORDER BY — never interpolate raw user input. */
export function buildOrderBy(
  sortBy: string | null | undefined,
  sortDir: string | null | undefined,
  allowed: string[],
  fallback = 'id'
): string {
  const column = sortBy && allowed.includes(sortBy) ? sortBy : fallback;
  const direction = String(sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return ` ORDER BY ${column} ${direction}`;
}

export function buildLimit(page?: number | string | null, limit?: number | string | null) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

/**
 * One-stop paginated list: runs the COUNT and the page SELECT with identical
 * WHERE/ORDER BY so numbers always agree.
 */
export async function paginatedQuery<T = RowDataPacket>(
  baseSql: string,
  countSql: string,
  params: SqlValue[],
  listQuery: ListQuery
): Promise<PagedResult<T>> {
  const { page, limit, offset } = buildLimit(listQuery.page, listQuery.limit);
  const total = Number((await queryScalar<number>(countSql, params)) ?? 0);
  const rows = await query<T>(`${baseSql}${buildOrderByTail(listQuery, limit, offset)}`, params);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, total),
    },
  };
}

function buildOrderByTail(listQuery: ListQuery, limit: number, offset: number): string {
  const allowed = listQuery.allowedSortColumns ?? listQuery.searchColumns ?? ['id'];
  return `${buildOrderBy(listQuery.sortBy, listQuery.sortDir, allowed, listQuery.defaultSort ?? 'id')} LIMIT ${limit} OFFSET ${offset}`;
}

/** Builds `AND col = ?` fragments, skipping empty values. */
export function eqFilter(column: string, value: SqlValue, params: SqlValue[]): string {
  if (value === null || value === undefined || value === '') return '';
  params.push(value);
  return ` AND ${column} = ?`;
}

export function inFilter(column: string, values: SqlValue[] | undefined, params: SqlValue[]): string {
  if (!values || values.length === 0) return '';
  const placeholders = values.map(() => '?').join(', ');
  params.push(...values);
  return ` AND ${column} IN (${placeholders})`;
}

export function dateRangeFilter(column: string, from: SqlValue, to: SqlValue, params: SqlValue[]): string {
  let sql = '';
  if (from) {
    params.push(from);
    sql += ` AND ${column} >= ?`;
  }
  if (to) {
    params.push(to);
    sql += ` AND ${column} <= ?`;
  }
  return sql;
}

/** Latest-wins UPSERT helper. */
export async function upsert(table: string, uniqueColumns: string[], data: Record<string, SqlValue>): Promise<number> {
  const { execute: exec } = await import('./mysql');
  const columns = Object.keys(data);
  const values = columns.map((c) => data[c] as SqlValue);
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.filter((c) => !uniqueColumns.includes(c)).map((c) => `${c} = VALUES(${c})`).join(', ');
  const sql =
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ` +
    (updates ? `ON DUPLICATE KEY UPDATE ${updates}` : '');
  const result = await exec(sql, values);
  return result.insertId;
}

export async function exists(sql: string, params: SqlValue[] = []): Promise<boolean> {
  return Boolean(await queryOne(sql, params));
}

export { query, queryOne, queryScalar };
