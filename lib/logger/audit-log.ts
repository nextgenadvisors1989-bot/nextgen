/** High-level audit trail queries for the Admin > Activity Logs screens. */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export async function getRecordHistory(tableName: string, recordId: number, limit = 100) {
  return query(
    `SELECT id, operation, field_name, old_value, new_value, changed_by_name, reason, created_at
       FROM audit_trails
      WHERE table_name = ? AND record_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ${Math.min(limit, 500)}`,
    [tableName, recordId]
  );
}

export async function getEntityActivity(entityType: string, entityId: number, limit = 50) {
  return query(
    `SELECT al.*, u.email AS actor_email
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
      WHERE al.entity_type = ? AND al.entity_id = ?
      ORDER BY al.created_at DESC
      LIMIT ${Math.min(limit, 500)}`,
    [entityType, entityId]
  );
}

export async function getEmployerActivity(employerId: number, limit = 100) {
  return query(
    `SELECT al.* FROM activity_logs al
      WHERE al.employer_id = ?
      ORDER BY al.created_at DESC
      LIMIT ${Math.min(limit, 500)}`,
    [employerId]
  );
}

export interface AuditSummary {
  totalActions: number;
  logins: number;
  creates: number;
  updates: number;
  deletes: number;
  approvals: number;
  failures: number;
}

export async function getActivitySummary(dateFrom?: string | null, dateTo?: string | null): Promise<AuditSummary> {
  const where: string[] = ['1 = 1'];
  const values: unknown[] = [];
  if (dateFrom) { where.push('DATE(created_at) >= ?'); values.push(dateFrom); }
  if (dateTo) { where.push('DATE(created_at) <= ?'); values.push(dateTo); }

  const row = await queryOne<RowDataPacket>(
    `SELECT
        COUNT(*) AS totalActions,
        SUM(action = 'login') AS logins,
        SUM(action IN ('created','create')) AS creates,
        SUM(action IN ('updated','update')) AS updates,
        SUM(action IN ('deleted','delete')) AS deletes,
        SUM(action IN ('approved','approve','verified')) AS approvals,
        SUM(status = 'failed') AS failures
      FROM activity_logs
     WHERE ${where.join(' AND ')}`,
    values
  );

  return {
    totalActions: Number(row?.totalActions ?? 0),
    logins: Number(row?.logins ?? 0),
    creates: Number(row?.creates ?? 0),
    updates: Number(row?.updates ?? 0),
    deletes: Number(row?.deletes ?? 0),
    approvals: Number(row?.approvals ?? 0),
    failures: Number(row?.failures ?? 0),
  };
}
