/**
 * Settings, delivery logs, scheduled jobs and backups — reads and writes.
 *
 * The `settings` table is keyed `(setting_group, setting_key)`, so the whole
 * catalogue is read in a handful of queries and written row by row with an
 * upsert, which means a setting that the seeds never created is still persisted
 * the first time an administrator saves it.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { paginatedQuery, buildSearch, type SqlValue } from '@/lib/db/query-helpers';
import { SETTING_GROUPS, type SettingGroup } from '@/lib/settings/definitions';
import type { DeliveryLogQuery } from '@/lib/validations/setting.validation';

export interface SettingRow extends RowDataPacket {
  id: number;
  setting_group: string;
  setting_key: string;
  setting_value: string | null;
  value_type: string;
  label: string | null;
  description: string | null;
  is_public: number | boolean;
  is_encrypted: number | boolean;
  sort_order: number;
  updated_at: string;
  updated_by_name?: string | null;
}

/* ─────────────────────────────── settings ─────────────────────────────── */

export function settingsForGroup(group: SettingGroup) {
  return query<SettingRow>(
    `SELECT s.id, s.setting_group, s.setting_key, s.setting_value, s.value_type, s.label, s.description,
            s.is_public, s.is_encrypted, s.sort_order, s.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS updated_by_name
       FROM settings s
       LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.setting_group = ?
      ORDER BY s.sort_order ASC, s.setting_key ASC`,
    [group]
  );
}

export function allSettings() {
  return query<SettingRow>(
    `SELECT setting_group, setting_key, setting_value, value_type, is_public, is_encrypted
       FROM settings
      ORDER BY setting_group ASC, sort_order ASC, setting_key ASC`
  );
}

export async function settingStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(is_encrypted = 1) AS secrets,
            SUM(is_public = 1) AS public_settings,
            COUNT(DISTINCT setting_group) AS groups,
            MAX(updated_at) AS last_updated
       FROM settings`
  );
  return {
    total: Number(row?.total ?? 0),
    secrets: Number(row?.secrets ?? 0),
    publicSettings: Number(row?.public_settings ?? 0),
    groups: Number(row?.groups ?? 0),
    lastUpdated: row?.last_updated ?? null,
  };
}

/** How much of the catalogue is actually filled in — drives the "configured" chips. */
export async function configurationCoverage() {
  const rows = await query<RowDataPacket>(
    `SELECT setting_group,
            COUNT(*) AS total,
            SUM(setting_value IS NOT NULL AND setting_value <> '' AND setting_value NOT IN ('false')) AS filled
       FROM settings
      GROUP BY setting_group`
  );
  return Object.fromEntries(
    rows.map((row) => [String(row.setting_group), { total: Number(row.total), filled: Number(row.filled) }])
  );
}

/**
 * Writes one setting. `isEncrypted` is only ever set from the catalogue, never
 * from a request, so a plain value can never be stored as a secret by accident
 * (or the reverse).
 */
export async function upsertSetting(input: {
  group: SettingGroup;
  key: string;
  value: string | null;
  isEncrypted: boolean;
  label?: string | null;
  description?: string | null;
  userId: number;
}) {
  await execute(
    `INSERT INTO settings (setting_group, setting_key, setting_value, value_type, label, description, is_encrypted, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       is_encrypted  = VALUES(is_encrypted),
       label         = COALESCE(VALUES(label), label),
       updated_by    = VALUES(updated_by)`,
    [
      input.group,
      input.key,
      input.value,
      input.isEncrypted ? 'string' : inferType(input.value),
      input.label ?? null,
      input.description ?? null,
      input.isEncrypted ? 1 : 0,
      input.userId,
    ]
  );
}

function inferType(value: string | null): string {
  if (value === null) return 'string';
  if (value === 'true' || value === 'false') return 'boolean';
  if (value !== '' && !Number.isNaN(Number(value))) return 'number';
  if (value.startsWith('{') || value.startsWith('[')) return 'json';
  return 'string';
}

/** The settings a public page or PDF needs, in one query. */
export async function publicSettings(keys?: string[]) {
  const params: SqlValue[] = [];
  let where = ' WHERE is_public = 1 AND is_encrypted = 0';
  if (keys?.length) {
    where += ` AND CONCAT(setting_group, '.', setting_key) IN (${keys.map(() => '?').join(', ')})`;
    params.push(...keys);
  }
  const rows = await query<RowDataPacket>(
    `SELECT setting_group, setting_key, setting_value FROM settings${where}`,
    params
  );
  return Object.fromEntries(rows.map((row) => [`${row.setting_group}.${row.setting_key}`, row.setting_value]));
}

export async function settingsUpdatedBy(group: SettingGroup) {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS name, u.id
       FROM settings s JOIN users u ON u.id = s.updated_by
      WHERE s.setting_group = ?`,
    [group]
  );
  return rows;
}

/* ───────────────────────────── delivery logs ───────────────────────────── */

const DELIVERY_TABLE: Record<string, { table: string; recipient: string }> = {
  email: { table: 'email_logs', recipient: 'to_email' },
  sms: { table: 'sms_logs', recipient: 'to_mobile' },
  whatsapp: { table: 'whatsapp_logs', recipient: 'to_mobile' },
};

export function deliveryLogs(channel: 'email' | 'sms' | 'whatsapp', filters: DeliveryLogQuery) {
  const target = DELIVERY_TABLE[channel];
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';

  where += buildSearch(filters.search ?? null, [target.recipient, 'template_code'], params);
  if (filters.status && filters.status !== 'all') {
    where += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.template_code) {
    where += ' AND template_code = ?';
    params.push(filters.template_code);
  }
  if (filters.from_date) {
    where += ' AND created_at >= ?';
    params.push(`${filters.from_date} 00:00:00`);
  }
  if (filters.to_date) {
    where += ' AND created_at <= ?';
    params.push(`${filters.to_date} 23:59:59`);
  }

  const order = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const select =
    channel === 'email'
      ? `id, to_email AS recipient, subject AS subject, template_code, status, provider, error_message, sent_at, created_at`
      : channel === 'sms'
        ? `id, to_mobile AS recipient, LEFT(message, 160) AS subject, template_code, status, provider, error_message, sent_at, created_at, segments`
        : `id, to_mobile AS recipient, LEFT(message, 160) AS subject, template_code, status, provider, error_message, sent_at, created_at`;

  return paginatedQuery<RowDataPacket>(
    `SELECT ${select} FROM ${target.table}${where}`,
    `SELECT COUNT(*) FROM ${target.table}${where}`,
    params,
    {
      page: filters.page,
      limit: filters.limit,
      sortBy: 'created_at',
      sortDir: filters.sortDir,
      allowedSortColumns: ['created_at'],
      defaultSort: 'created_at',
    }
  ).then((result) => result);
}

export async function deliveryStats(channel: 'email' | 'sms' | 'whatsapp') {
  const { table } = DELIVERY_TABLE[channel];
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'sent') AS sent,
            SUM(status = 'failed') AS failed,
            SUM(status = 'queued') AS queued,
            SUM(status = 'skipped') AS skipped,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS last7,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status = 'failed') AS failed7,
            MAX(created_at) AS last_attempt
       FROM ${table}`
  );
  return {
    total: Number(row?.total ?? 0),
    sent: Number(row?.sent ?? 0),
    failed: Number(row?.failed ?? 0),
    queued: Number(row?.queued ?? 0),
    skipped: Number(row?.skipped ?? 0),
    last7: Number(row?.last7 ?? 0),
    failed7: Number(row?.failed7 ?? 0),
    lastAttempt: row?.last_attempt ?? null,
  };
}

export function deliveryTemplates(channel: 'email' | 'sms' | 'whatsapp') {
  const { table } = DELIVERY_TABLE[channel];
  return query<RowDataPacket>(
    `SELECT template_code, COUNT(*) AS total
       FROM ${table}
      WHERE template_code IS NOT NULL
      GROUP BY template_code
      ORDER BY total DESC, template_code ASC
      LIMIT 50`
  );
}

export function recentDeliveryFailures(channel: 'email' | 'sms' | 'whatsapp', limit = 5) {
  const { table, recipient } = DELIVERY_TABLE[channel];
  return query<RowDataPacket>(
    `SELECT id, ${recipient} AS recipient, template_code, error_message, created_at
       FROM ${table}
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT ?`,
    [limit]
  );
}

/* ──────────────────────────── scheduled jobs ──────────────────────────── */

export function scheduledJobs() {
  return query<RowDataPacket>(
    `SELECT id, job_code, job_name, description, cron_expression, job_type, last_run_at, last_run_status,
            last_run_message, next_run_at, is_active, created_at, updated_at
       FROM scheduled_jobs
      ORDER BY is_active DESC, job_name ASC`
  );
}

export function scheduledJobByCode(jobCode: string) {
  return queryOne<RowDataPacket>('SELECT * FROM scheduled_jobs WHERE job_code = ? LIMIT 1', [jobCode]);
}

export async function updateScheduledJob(jobCode: string, changes: { is_active?: boolean; cron_expression?: string | null }) {
  const columns: string[] = [];
  const params: SqlValue[] = [];
  if (changes.is_active !== undefined) {
    columns.push('is_active = ?');
    params.push(changes.is_active ? 1 : 0);
  }
  if (changes.cron_expression !== undefined) {
    columns.push('cron_expression = ?');
    params.push(changes.cron_expression);
  }
  if (!columns.length) return 0;
  params.push(jobCode);
  const result = await execute(`UPDATE scheduled_jobs SET ${columns.join(', ')} WHERE job_code = ?`, params);
  return Number(result.affectedRows ?? 0);
}

export async function recordJobRun(jobCode: string, run: {
  status: 'success' | 'failed' | 'running';
  message?: string | null;
  nextRunAt?: string | null;
}) {
  await execute(
    `UPDATE scheduled_jobs
        SET last_run_at = NOW(), last_run_status = ?, last_run_message = ?, next_run_at = COALESCE(?, next_run_at)
      WHERE job_code = ?`,
    [run.status, run.message?.slice(0, 2000) ?? null, run.nextRunAt ?? null, jobCode]
  );
}

/* ─────────────────────────────── backups ──────────────────────────────── */

export async function backupHistory(filters: { page: number; limit: number; status: string; triggered_by: string }) {
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';
  if (filters.status !== 'all') {
    where += ' AND b.status = ?';
    params.push(filters.status);
  }
  if (filters.triggered_by !== 'all') {
    where += ' AND b.triggered_by = ?';
    params.push(filters.triggered_by);
  }

  return paginatedQuery<RowDataPacket>(
    `SELECT b.id, b.backup_name, b.backup_type, b.file_path, b.file_size_bytes, b.status, b.error_message,
            b.started_at, b.completed_at, b.duration_seconds, b.triggered_by,
            CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM backup_history b
       LEFT JOIN users u ON u.id = b.created_by${where}`,
    `SELECT COUNT(*) FROM backup_history b${where}`,
    params,
    { page: filters.page, limit: filters.limit, sortBy: 'started_at', sortDir: 'desc', allowedSortColumns: ['started_at'], defaultSort: 'started_at' }
  );
}

export async function backupStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'completed') AS completed,
            SUM(status = 'failed') AS failed,
            SUM(status = 'running') AS running,
            SUM(file_size_bytes) AS bytes,
            MAX(CASE WHEN status = 'completed' THEN completed_at END) AS last_success
       FROM backup_history`
  );
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    running: Number(row?.running ?? 0),
    bytes: Number(row?.bytes ?? 0),
    lastSuccess: row?.last_success ?? null,
  };
}

export function backupById(id: number) {
  return queryOne<RowDataPacket>('SELECT * FROM backup_history WHERE id = ? LIMIT 1', [id]);
}

export async function insertBackupRun(input: {
  name: string;
  type: string;
  filePath: string;
  triggeredBy: 'manual' | 'scheduled';
  userId: number | null;
}) {
  const result = await execute(
    `INSERT INTO backup_history (backup_name, backup_type, file_path, status, triggered_by, created_by, started_at)
     VALUES (?, ?, ?, 'running', ?, ?, NOW())`,
    [input.name, input.type, input.filePath, input.triggeredBy, input.userId]
  );
  return Number(result.insertId);
}

export async function completeBackupRun(id: number, input: { sizeBytes: number; tables: string[] }) {
  await execute(
    `UPDATE backup_history
        SET status = 'completed', file_size_bytes = ?, tables_included = ?, completed_at = NOW(),
            duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
      WHERE id = ?`,
    [input.sizeBytes, JSON.stringify(input.tables), id]
  );
}

export async function failBackupRun(id: number, message: string) {
  await execute(
    `UPDATE backup_history
        SET status = 'failed', error_message = ?, completed_at = NOW(),
            duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
      WHERE id = ?`,
    [message.slice(0, 2000), id]
  );
}

export async function deleteBackupRun(id: number) {
  const result = await execute('DELETE FROM backup_history WHERE id = ?', [id]);
  return Number(result.affectedRows ?? 0);
}

export async function databaseTableCount() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  return Number(row?.total ?? 0);
}

export function databaseTableNames() {
  return query<RowDataPacket>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME ASC`
  );
}

export async function databaseSizeMb() {
  const row = await queryOne<RowDataPacket>(
    `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS mb
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  );
  return Number(row?.mb ?? 0);
}

/** Settings groups that exist in the table but are not in the catalogue. */
export function unknownSettingGroups() {
  return query<RowDataPacket>(
    `SELECT DISTINCT setting_group FROM settings
      WHERE setting_group NOT IN (${SETTING_GROUPS.map(() => '?').join(', ')})`,
    [...SETTING_GROUPS]
  );
}
