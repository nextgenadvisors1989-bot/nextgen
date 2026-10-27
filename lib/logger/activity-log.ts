/**
 * Activity logging. Every create/update/delete/submit/approve/reject in the
 * platform calls writeActivityLog so the Admin > Activity Logs screen is a
 * complete, faithful record.
 */
import { insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export interface ActivityLogInput {
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  employerId?: number | null;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: number | null;
  entityLabel?: string | null;
  description?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestMethod?: string | null;
  requestUrl?: string | null;
  status?: 'success' | 'failed' | 'warning';
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  durationMs?: number | null;
}

/** Fields we never persist in a log diff (secrets / noise). */
const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'new_password', 'confirm_password', 'current_password',
  'temporary_password', 'token', 'nonce', 'secret', 'api_key', 'access_token',
  'smtp_password', 'auth_token',
]);

export function sanitizeForLog(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!values) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[redacted]';
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeForLog(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Returns only the keys whose values differ, with before/after pairs. */
export function diffValues(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  if (!before || !after) return changed;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (SENSITIVE_KEYS.has(key)) continue;
    const a = normalize(before[key]);
    const b = normalize(after[key]);
    if (a !== b) changed[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return changed;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export async function writeActivityLog(input: ActivityLogInput): Promise<number> {
  try {
    const changed = diffValues(input.oldValues, input.newValues);
    return await insert(
      `INSERT INTO activity_logs
        (user_id, user_name, user_role, employer_id, action, module, entity_type, entity_id, entity_label,
         description, old_values_json, new_values_json, changed_fields, ip_address, user_agent,
         request_method, request_url, status, severity, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId ?? null,
        input.userName ?? null,
        input.userRole ?? null,
        input.employerId ?? null,
        input.action,
        input.module,
        input.entityType ?? null,
        input.entityId ?? null,
        input.entityLabel?.slice(0, 500) ?? null,
        input.description ?? null,
        input.oldValues ? JSON.stringify(sanitizeForLog(input.oldValues)) : null,
        input.newValues ? JSON.stringify(sanitizeForLog(input.newValues)) : null,
        Object.keys(changed).length ? JSON.stringify(changed) : null,
        input.ipAddress ?? null,
        input.userAgent?.slice(0, 500) ?? null,
        input.requestMethod ?? null,
        input.requestUrl?.slice(0, 1000) ?? null,
        input.status ?? 'success',
        input.severity ?? 'info',
        input.durationMs ?? null,
      ]
    );
  } catch (error) {
    // Logging must never break the business operation it describes.
    console.error('[activity-log] failed to persist entry:', (error as Error).message);
    return 0;
  }
}

/** Column-level audit trail for a single record (used by compliance-critical tables). */
export async function writeAuditTrail(input: {
  tableName: string;
  recordId: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'SOFT_DELETE' | 'RESTORE';
  changes?: Record<string, { from: unknown; to: unknown }>;
  changedBy?: number | null;
  changedByName?: string | null;
  ipAddress?: string | null;
  reason?: string | null;
}) {
  const changes = input.changes ?? {};
  if (Object.keys(changes).length === 0) {
    await insert(
      `INSERT INTO audit_trails (table_name, record_id, operation, changed_by, changed_by_name, ip_address, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.tableName, input.recordId, input.operation, input.changedBy ?? null, input.changedByName ?? null, input.ipAddress ?? null, input.reason ?? null]
    );
    return;
  }
  for (const [field, pair] of Object.entries(changes)) {
    await insert(
      `INSERT INTO audit_trails (table_name, record_id, operation, field_name, old_value, new_value,
                                 changed_by, changed_by_name, ip_address, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.tableName, input.recordId, input.operation, field, stringify(pair.from), stringify(pair.to),
        input.changedBy ?? null, input.changedByName ?? null, input.ipAddress ?? null, input.reason ?? null,
      ]
    );
  }
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export interface ActivityListParams {
  page?: number;
  limit?: number;
  search?: string;
  module?: string;
  action?: string;
  userId?: number;
  employerId?: number;
  entityType?: string;
  status?: string;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listActivityLogs(params: ActivityListParams) {
  const where: string[] = ['1 = 1'];
  const values: unknown[] = [];

  if (params.search) {
    where.push('(al.description LIKE ? OR al.entity_label LIKE ? OR al.user_name LIKE ?)');
    const term = `%${params.search}%`;
    values.push(term, term, term);
  }
  if (params.module) { where.push('al.module = ?'); values.push(params.module); }
  if (params.action) { where.push('al.action = ?'); values.push(params.action); }
  if (params.userId) { where.push('al.user_id = ?'); values.push(params.userId); }
  if (params.employerId) { where.push('al.employer_id = ?'); values.push(params.employerId); }
  if (params.entityType) { where.push('al.entity_type = ?'); values.push(params.entityType); }
  if (params.status) { where.push('al.status = ?'); values.push(params.status); }
  if (params.severity) { where.push('al.severity = ?'); values.push(params.severity); }
  if (params.dateFrom) { where.push('DATE(al.created_at) >= ?'); values.push(params.dateFrom); }
  if (params.dateTo) { where.push('DATE(al.created_at) <= ?'); values.push(params.dateTo); }

  const limit = Math.min(Math.max(params.limit ?? 25, 1), 200);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const whereSql = where.join(' AND ');

  const total = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM activity_logs al WHERE ${whereSql}`, values);
  const rows = await query(
    `SELECT al.*, e.company_name AS employer_name
       FROM activity_logs al
       LEFT JOIN employers e ON e.id = al.employer_id
      WHERE ${whereSql}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  const count = Number(total?.total ?? 0);
  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.max(Math.ceil(count / limit), 1),
      from: count === 0 ? 0 : offset + 1,
      to: Math.min(offset + limit, count),
    },
  };
}
