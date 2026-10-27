/**
 * Activity-log reads. The writer lives in lib/logger/activity-log.ts; this is the
 * read side used by the record pages (a document's own trail) and by the
 * Admin > Activity Logs screen.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, eqFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';

export interface ActivityLogFilters extends ListQuery {
  entityType?: string | null;
  entityId?: number | null;
  module?: string | null;
  action?: string | null;
  userId?: number | null;
  userRole?: string | null;
  status?: string | null;
  severity?: string | null;
  from_date?: string | null;
  to_date?: string | null;
}

const SORTABLE = ['created_at', 'action', 'module', 'user_name'];
const COLUMNS = `a.id, a.user_id, a.user_name, a.user_role, a.employer_id, a.action, a.module, a.entity_type,
  a.entity_id, a.entity_label, a.description, a.changed_fields, a.ip_address, a.request_method, a.request_url,
  a.status, a.severity, a.created_at`;

/**
 * Entity types were written by different modules over time — `employer` beside
 * `auditors`, `compliance_act` beside `SUBMISSION` — so the filter matches on
 * case-insensitive singular/plural variants. An operator picking "Employers"
 * finds the trail whichever spelling the writer used.
 */
function entityTypeVariants(value: string): string[] {
  const base = String(value).trim().toUpperCase();
  const variants = new Set([base]);
  if (base.endsWith('S') && base.length > 2) variants.add(base.slice(0, -1));
  else variants.add(`${base}S`);
  // The employees table is `employees`; its records are written as `employee`.
  return [...variants];
}

function buildWhere(filters: ActivityLogFilters, params: SqlValue[]): string {
  let where = ' WHERE 1 = 1';
  where += buildSearch(filters.search ?? null, ['a.description', 'a.user_name', 'a.entity_label', 'a.request_url'], params);
  if (filters.entityType) {
    const variants = entityTypeVariants(String(filters.entityType));
    where += ` AND UPPER(a.entity_type) IN (${variants.map(() => '?').join(', ')})`;
    params.push(...variants);
  }
  if (filters.entityId) where += eqFilter('a.entity_id', Number(filters.entityId), params);
  if (filters.module) where += eqFilter('a.module', String(filters.module), params);
  if (filters.action) where += eqFilter('a.action', String(filters.action), params);
  if (filters.userId) where += eqFilter('a.user_id', Number(filters.userId), params);
  if (filters.userRole && filters.userRole !== 'all') where += eqFilter('a.user_role', String(filters.userRole), params);
  if (filters.status) where += eqFilter('a.status', String(filters.status), params);
  if (filters.severity) where += eqFilter('a.severity', String(filters.severity), params);
  if (filters.from_date) { where += ' AND a.created_at >= ?'; params.push(`${filters.from_date} 00:00:00`); }
  if (filters.to_date) { where += ' AND a.created_at <= ?'; params.push(`${filters.to_date} 23:59:59`); }
  return where;
}

export function findActivityLogs(filters: ActivityLogFilters) {
  const params: SqlValue[] = [];
  const where = buildWhere(filters, params);
  return paginatedQuery(
    `SELECT ${COLUMNS} FROM activity_logs a${where}`,
    `SELECT COUNT(*) FROM activity_logs a${where}`,
    params,
    {
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      // The table is aliased `a`, so the whitelist carries the prefix the ORDER BY needs.
      allowedSortColumns: ['a.created_at', 'a.action', 'a.module', 'a.user_name', 'a.id'],
      // A column, not an expression: the helper appends the direction itself.
      defaultSort: 'a.created_at',
    }
  );
}

export async function activityLogFilters() {
  const [actions, modules, roles, actors, entities] = await Promise.all([
    query<RowDataPacket>('SELECT action, COUNT(*) AS total FROM activity_logs GROUP BY action ORDER BY total DESC LIMIT 60'),
    query<RowDataPacket>('SELECT module, COUNT(*) AS total FROM activity_logs GROUP BY module ORDER BY module LIMIT 60'),
    query<RowDataPacket>('SELECT user_role, COUNT(*) AS total FROM activity_logs WHERE user_role IS NOT NULL GROUP BY user_role ORDER BY total DESC LIMIT 30'),
    query<RowDataPacket>(
      `SELECT a.user_id AS id, a.user_name AS name, COUNT(*) AS total
         FROM activity_logs a WHERE a.user_id IS NOT NULL
        GROUP BY a.user_id, a.user_name ORDER BY total DESC LIMIT 50`
    ),
    query<RowDataPacket>(
      `SELECT entity_type, COUNT(*) AS total FROM activity_logs
        WHERE entity_type IS NOT NULL GROUP BY entity_type ORDER BY total DESC LIMIT 40`
    ),
  ]);
  return {
    actions: actions.map((row) => ({ value: String(row.action), label: `${row.action} (${Number(row.total)})` })),
    modules: modules.map((row) => ({ value: String(row.module), label: `${row.module} (${Number(row.total)})` })),
    roles: roles.map((row) => ({ value: String(row.user_role), label: `${row.user_role} (${Number(row.total)})` })),
    entities: entities.map((row) => ({ value: String(row.entity_type), label: `${row.entity_type} (${Number(row.total)})` })),
    actors: actors.map((row) => ({ id: Number(row.id), name: String(row.name ?? `User #${row.id}`), total: Number(row.total) })),
  };
}

/**
 * What the log looks like over time — the per-day action counts the screen
 * charts, plus a severity split so a spike of failures is visible without
 * reading a single row.
 */
export async function activityTrend(days = 14) {
  return query<RowDataPacket>(
    `SELECT DATE(created_at) AS day,
            COUNT(*) AS total,
            SUM(status = 'failed') AS failed,
            SUM(action IN ('created', 'create')) AS creates,
            SUM(action IN ('updated', 'update')) AS updates,
            SUM(action IN ('deleted', 'delete', 'archived')) AS deletes
       FROM activity_logs
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC`,
    [Math.min(Math.max(Number(days) || 14, 1), 90)]
  );
}

/** Most active modules and actors — the top of the "who is doing what" view. */
export async function activityLeaderboard(limit = 6) {
  const [modules, actors] = await Promise.all([
    query<RowDataPacket>(
      `SELECT module, COUNT(*) AS total, SUM(status = 'failed') AS failed
         FROM activity_logs GROUP BY module ORDER BY total DESC LIMIT ?`,
      [limit]
    ),
    query<RowDataPacket>(
      `SELECT user_name AS name, user_role AS role, COUNT(*) AS total
         FROM activity_logs WHERE user_name IS NOT NULL
        GROUP BY user_name, user_role ORDER BY total DESC LIMIT ?`,
      [limit]
    ),
  ]);
  return {
    modules: modules.map((row) => ({ module: String(row.module), total: Number(row.total), failed: Number(row.failed) })),
    actors: actors.map((row) => ({ name: String(row.name), role: row.role ? String(row.role) : null, total: Number(row.total) })),
  };
}

export async function activityStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(created_at >= CURDATE()) AS today,
            SUM(status = 'failed') AS failed,
            SUM(severity IN ('high','critical')) AS severe,
            COUNT(DISTINCT user_id) AS actors
       FROM activity_logs`
  );
  return {
    total: Number(row?.total ?? 0),
    today: Number(row?.today ?? 0),
    failed: Number(row?.failed ?? 0),
    severe: Number(row?.severe ?? 0),
    actors: Number(row?.actors ?? 0),
  };
}

/** The per-record trail shown on a detail page. */
export function recordTrail(entityType: string, entityId: number, limit = 25) {
  return query<RowDataPacket>(
    `SELECT ${COLUMNS} FROM activity_logs a
      WHERE a.entity_type = ? AND a.entity_id = ?
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`,
    [entityType, entityId, limit]
  );
}
