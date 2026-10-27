/**
 * Error-log reads and the resolution workflow.
 *
 * Every 500 the platform raises lands here with its stack trace (see
 * `handleRouteError` → `logError`). The screen is the operator's queue: triage
 * by severity, open the trace, then mark it resolved with a note so a repeat
 * incident is visibly different from an untouched one.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, eqFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';

export interface ErrorLogFilters extends ListQuery {
  severity?: string | null;
  resolved?: string | null;
  error_type?: string | null;
  route_name?: string | null;
  from_date?: string | null;
  to_date?: string | null;
}

const ERROR_COLUMNS = `e.id, e.error_code, e.error_type, e.message, e.file_path, e.line_number, e.route,
  e.request_method, e.severity, e.is_resolved, e.resolved_by, e.resolved_at, e.resolution_note, e.created_at,
  CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS actor_name,
  CONCAT(COALESCE(r.first_name, ''), ' ', COALESCE(r.last_name, '')) AS resolved_by_name`;

const ERROR_SORT = ['e.created_at', 'e.id', 'e.severity', 'e.error_type', 'e.route', 'e.is_resolved'];

export async function findErrorLogs(filters: ErrorLogFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';
  where += buildSearch(filters.search ?? null, ['e.message', 'e.route', 'e.error_type', 'e.error_code', 'e.file_path'], params);
  if (filters.severity && filters.severity !== 'all') where += eqFilter('e.severity', String(filters.severity), params);
  if (filters.error_type && filters.error_type !== 'all') where += eqFilter('e.error_type', String(filters.error_type), params);
  if (filters.route_name && filters.route_name !== 'all') where += eqFilter('e.route', String(filters.route_name), params);
  const resolved = String(filters.resolved ?? 'all');
  if (resolved === 'true' || resolved === 'resolved') where += ' AND e.is_resolved = 1';
  if (resolved === 'false' || resolved === 'open') where += ' AND e.is_resolved = 0';
  if (filters.from_date) { where += ' AND e.created_at >= ?'; params.push(`${filters.from_date} 00:00:00`); }
  if (filters.to_date) { where += ' AND e.created_at <= ?'; params.push(`${filters.to_date} 23:59:59`); }

  const joins = ` LEFT JOIN users u ON u.id = e.user_id LEFT JOIN users r ON r.id = e.resolved_by`;
  return paginatedQuery<RowDataPacket>(
    `SELECT ${ERROR_COLUMNS} FROM error_logs e${joins}${where}`,
    `SELECT COUNT(*) FROM error_logs e${where}`,
    params,
    {
      ...(filters as unknown as ListQuery),
      allowedSortColumns: ERROR_SORT,
      defaultSort: 'e.created_at',
    }
  );
}

export async function errorLogStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(is_resolved = 0) AS open,
            SUM(is_resolved = 1) AS resolved,
            SUM(is_resolved = 0 AND severity IN ('critical', 'fatal')) AS critical,
            SUM(created_at >= CURDATE()) AS today,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS last24,
            COUNT(DISTINCT route) AS routes,
            COUNT(DISTINCT error_type) AS types
       FROM error_logs`
  );
  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    resolved: Number(row?.resolved ?? 0),
    critical: Number(row?.critical ?? 0),
    today: Number(row?.today ?? 0),
    last24: Number(row?.last24 ?? 0),
    routes: Number(row?.routes ?? 0),
    types: Number(row?.types ?? 0),
  };
}

export async function errorLogFacets() {
  const [types, routes] = await Promise.all([
    query<RowDataPacket>(
      `SELECT error_type, COUNT(*) AS total FROM error_logs GROUP BY error_type ORDER BY total DESC LIMIT 40`
    ),
    query<RowDataPacket>(
      `SELECT route, COUNT(*) AS total FROM error_logs
        WHERE route IS NOT NULL GROUP BY route ORDER BY total DESC LIMIT 40`
    ),
  ]);
  return {
    types: types.map((row) => ({ value: String(row.error_type), label: `${row.error_type} (${Number(row.total)})` })),
    routes: routes.map((row) => ({ value: String(row.route), label: `${row.route} (${Number(row.total)})` })),
  };
}

/** One error with everything needed to reproduce it. */
export async function findErrorLogById(errorId: number) {
  return queryOne<RowDataPacket>(
    `SELECT ${ERROR_COLUMNS}, e.stack_trace, e.request_body, e.ip_address, e.user_id
       FROM error_logs e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN users r ON r.id = e.resolved_by
      WHERE e.id = ?
      LIMIT 1`,
    [errorId]
  );
}

export async function setErrorResolved(
  errorId: number,
  input: { resolved: boolean; resolutionNote?: string | null; resolvedBy: number }
) {
  const result = await execute(
    `UPDATE error_logs
        SET is_resolved = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?
      WHERE id = ?`,
    [
      input.resolved ? 1 : 0,
      input.resolved ? input.resolvedBy : null,
      input.resolved ? new Date() : null,
      input.resolved ? (input.resolutionNote ?? null) : null,
      errorId,
    ]
  );
  return Number(result.affectedRows ?? 0);
}
