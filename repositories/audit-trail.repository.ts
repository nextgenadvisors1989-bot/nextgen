/**
 * Column-level audit trails and authentication attempts.
 *
 * `audit_trails` holds one row per changed field (see `writeAuditTrail`), which
 * is what makes "who changed the Aadhaar number, from what to what, and why" an
 * answerable question. `login_attempts` records every sign-in, successful or
 * not, with the client address and user agent.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, eqFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';

export interface AuditTrailFilters extends ListQuery {
  table_name?: string | null;
  record_id?: number | null;
  operation?: string | null;
  field_name?: string | null;
  changed_by?: number | null;
  from_date?: string | null;
  to_date?: string | null;
  changedOnly?: boolean;
}

export interface LoginAttemptFilters extends ListQuery {
  success?: string | null;
  failure_reason?: string | null;
  user_id?: number | null;
  from_date?: string | null;
  to_date?: string | null;
}

const TRAIL_COLUMNS = `t.id, t.table_name, t.record_id, t.operation, t.field_name, t.old_value, t.new_value,
  t.changed_by, t.changed_by_name, t.ip_address, t.reason, t.created_at`;

const TRAIL_SORT = ['t.created_at', 't.id', 't.table_name', 't.operation', 't.field_name', 't.changed_by_name'];

export async function findAuditTrails(filters: AuditTrailFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';
  where += buildSearch(filters.search ?? null, ['t.table_name', 't.field_name', 't.changed_by_name', 't.reason', 't.old_value', 't.new_value'], params);
  if (filters.table_name && filters.table_name !== 'all') where += eqFilter('t.table_name', String(filters.table_name), params);
  if (filters.record_id) where += eqFilter('t.record_id', Number(filters.record_id), params);
  if (filters.operation && filters.operation !== 'all') where += eqFilter('t.operation', String(filters.operation), params);
  if (filters.field_name && filters.field_name !== 'all') where += eqFilter('t.field_name', String(filters.field_name), params);
  if (filters.changed_by) where += eqFilter('t.changed_by', Number(filters.changed_by), params);
  // Row-level entries (no field) are the "record was created/deleted" markers;
  // the field-level filter hides them when a specific column is being traced.
  if (filters.changedOnly) where += ' AND t.field_name IS NOT NULL';
  if (filters.from_date) { where += ' AND t.created_at >= ?'; params.push(`${filters.from_date} 00:00:00`); }
  if (filters.to_date) { where += ' AND t.created_at <= ?'; params.push(`${filters.to_date} 23:59:59`); }

  return paginatedQuery<RowDataPacket>(
    `SELECT ${TRAIL_COLUMNS} FROM audit_trails t${where}`,
    `SELECT COUNT(*) FROM audit_trails t${where}`,
    params,
    {
      ...(filters as unknown as ListQuery),
      allowedSortColumns: TRAIL_SORT,
      defaultSort: 't.created_at',
    }
  );
}

export async function auditTrailStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(operation = 'UPDATE') AS updates,
            SUM(operation = 'INSERT') AS inserts,
            SUM(operation = 'DELETE') AS deletes,
            SUM(operation = 'SOFT_DELETE') AS softDeletes,
            SUM(operation = 'RESTORE') AS restores,
            SUM(created_at >= CURDATE()) AS today,
            COUNT(DISTINCT table_name) AS tables,
            COUNT(DISTINCT changed_by) AS actors,
            COUNT(DISTINCT CONCAT(table_name, '#', record_id)) AS records
       FROM audit_trails`
  );
  return {
    total: Number(row?.total ?? 0),
    updates: Number(row?.updates ?? 0),
    inserts: Number(row?.inserts ?? 0),
    deletes: Number(row?.deletes ?? 0),
    softDeletes: Number(row?.softDeletes ?? 0),
    restores: Number(row?.restores ?? 0),
    today: Number(row?.today ?? 0),
    tables: Number(row?.tables ?? 0),
    actors: Number(row?.actors ?? 0),
    records: Number(row?.records ?? 0),
  };
}

/** Tables and fields that actually appear in the trail, for the filter lists. */
export async function auditTrailFacets() {
  const [tables, fields, operations, actors] = await Promise.all([
    query<RowDataPacket>(
      `SELECT table_name, COUNT(*) AS total FROM audit_trails GROUP BY table_name ORDER BY total DESC LIMIT 60`
    ),
    query<RowDataPacket>(
      `SELECT field_name, COUNT(*) AS total FROM audit_trails
        WHERE field_name IS NOT NULL GROUP BY field_name ORDER BY total DESC LIMIT 60`
    ),
    query<RowDataPacket>(
      `SELECT operation, COUNT(*) AS total FROM audit_trails GROUP BY operation ORDER BY total DESC`
    ),
    query<RowDataPacket>(
      `SELECT changed_by AS id, changed_by_name AS name, COUNT(*) AS total
         FROM audit_trails WHERE changed_by IS NOT NULL
        GROUP BY changed_by, changed_by_name ORDER BY total DESC LIMIT 50`
    ),
  ]);
  return {
    tables: tables.map((row) => ({ value: String(row.table_name), label: `${row.table_name} (${Number(row.total)})` })),
    fields: fields.map((row) => ({ value: String(row.field_name), label: `${row.field_name} (${Number(row.total)})` })),
    operations: operations.map((row) => ({ value: String(row.operation), label: `${row.operation} (${Number(row.total)})` })),
    actors: actors.map((row) => ({ id: Number(row.id), name: String(row.name ?? `User #${row.id}`), total: Number(row.total) })),
  };
}

/* ───────────────────────────── login attempts ────────────────────────────── */

const ATTEMPT_COLUMNS = `la.id, la.email, la.user_id, la.success, la.failure_reason, la.ip_address, la.user_agent,
  la.attempted_at, CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS user_name, u.status AS user_status`;

const ATTEMPT_SORT = ['la.attempted_at', 'la.id', 'la.email', 'la.success', 'la.ip_address'];

export async function findLoginAttempts(filters: LoginAttemptFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';
  where += buildSearch(filters.search ?? null, ['la.email', 'la.ip_address', 'la.user_agent', 'la.failure_reason'], params);
  if (filters.success === 'true') where += ' AND la.success = 1';
  if (filters.success === 'false') where += ' AND la.success = 0';
  if (filters.failure_reason && filters.failure_reason !== 'all') where += eqFilter('la.failure_reason', String(filters.failure_reason), params);
  if (filters.user_id) where += eqFilter('la.user_id', Number(filters.user_id), params);
  if (filters.from_date) { where += ' AND la.attempted_at >= ?'; params.push(`${filters.from_date} 00:00:00`); }
  if (filters.to_date) { where += ' AND la.attempted_at <= ?'; params.push(`${filters.to_date} 23:59:59`); }

  const joins = ' LEFT JOIN users u ON u.id = la.user_id';
  return paginatedQuery<RowDataPacket>(
    `SELECT ${ATTEMPT_COLUMNS} FROM login_attempts la${joins}${where}`,
    `SELECT COUNT(*) FROM login_attempts la${where}`,
    params,
    {
      ...(filters as unknown as ListQuery),
      allowedSortColumns: ATTEMPT_SORT,
      defaultSort: 'la.attempted_at',
    }
  );
}

export async function loginAttemptStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(success = 1) AS succeeded,
            SUM(success = 0) AS failed,
            SUM(success = 0 AND attempted_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS failedLast24,
            COUNT(DISTINCT email) AS emails,
            COUNT(DISTINCT ip_address) AS ips,
            SUM(attempted_at >= CURDATE()) AS today
       FROM login_attempts`
  );
  return {
    total: Number(row?.total ?? 0),
    succeeded: Number(row?.succeeded ?? 0),
    failed: Number(row?.failed ?? 0),
    failedLast24: Number(row?.failedLast24 ?? 0),
    emails: Number(row?.emails ?? 0),
    ips: Number(row?.ips ?? 0),
    today: Number(row?.today ?? 0),
  };
}

export function loginAttemptFacets() {
  return query<RowDataPacket>(
    `SELECT failure_reason, COUNT(*) AS total FROM login_attempts
      WHERE failure_reason IS NOT NULL
      GROUP BY failure_reason ORDER BY total DESC LIMIT 30`
  );
}

/**
 * Repeated failures from one address — the signal an administrator actually
 * acts on, so the screen surfaces it above the table.
 */
export function suspiciousAddresses(limit = 5) {
  return query<RowDataPacket>(
    `SELECT ip_address, COUNT(*) AS attempts,
            SUM(success = 0) AS failures,
            COUNT(DISTINCT email) AS emails,
            MAX(attempted_at) AS last_seen
       FROM login_attempts
      WHERE ip_address IS NOT NULL
      GROUP BY ip_address
     HAVING failures >= 3
      ORDER BY failures DESC, last_seen DESC
      LIMIT ?`,
    [limit]
  );
}
