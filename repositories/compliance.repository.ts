/**
 * Compliance register reads and writes.
 *
 * Every list runs the same WHERE/ORDER BY through `paginatedQuery`, so the count
 * and the page always agree. Searches are LIKE-escaped and every filter is bound
 * as a parameter — nothing is interpolated except whitelisted sort columns.
 *
 * `compliance_documents.compliance_status` is stored, but the register also
 * derives it (`effective_status`) from the expiry date, so a licence that lapsed
 * overnight shows as Expired the moment the page is opened even if the nightly
 * reminder job has not run yet. `syncExpiryStatuses()` writes that derivation
 * back for rows that drifted.
 */
import { execute, insert, query, queryOne, queryScalar, type RowDataPacket } from '@/lib/db/mysql';
import {
  buildSearch, eqFilter, escapeLike, paginatedQuery, type ListQuery, type SqlValue,
} from '@/lib/db/query-helpers';

/* ══════════════════════════════════ acts ═════════════════════════════════ */

export const ACT_COLUMNS = `a.id, a.act_name, a.short_name, a.act_number, a.act_year, a.jurisdiction, a.state_name,
  a.ministry, a.department, a.enactment_date, a.effective_date, a.last_amended_date, a.applicability_criteria,
  a.industry_applicability, a.employee_threshold, a.summary, a.official_source_url, a.status,
  a.created_at, a.updated_at`;

const ACT_SORT = ['act_name', 'act_year', 'created_at', 'updated_at', 'status', 'jurisdiction'];

export interface ActListFilters extends ListQuery {
  jurisdiction?: string | null;
  status?: string | null;
  state_name?: string | null;
}

export async function findActs(filters: ActListFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE a.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['a.act_name', 'a.short_name', 'a.act_number', 'a.summary'], params);
  if (filters.jurisdiction && filters.jurisdiction !== 'all') where += eqFilter('a.jurisdiction', filters.jurisdiction, params);
  if (filters.status && filters.status !== 'all') where += eqFilter('a.status', filters.status, params);
  if (filters.state_name && filters.state_name !== 'all') where += eqFilter('a.state_name', filters.state_name, params);

  const baseSql = `SELECT ${ACT_COLUMNS},
      (SELECT COUNT(*) FROM compliance_rules r WHERE r.act_id = a.id AND r.deleted_at IS NULL) AS rule_count,
      (SELECT COUNT(*) FROM compliance_regulations g WHERE g.act_id = a.id AND g.deleted_at IS NULL) AS regulation_count,
      (SELECT COUNT(*) FROM compliance_notifications n WHERE n.act_id = a.id AND n.deleted_at IS NULL) AS notification_count,
      (SELECT COUNT(*) FROM compliance_documents d WHERE d.act_id = a.id AND d.deleted_at IS NULL) AS document_count
    FROM compliance_acts a${where}`;
  const countSql = `SELECT COUNT(*) FROM compliance_acts a${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: ACT_SORT,
    defaultSort: 'act_name',
  });
}

export async function findActById(actId: number): Promise<RowDataPacket | null> {
  return queryOne<RowDataPacket>(
    `SELECT ${ACT_COLUMNS},
        (SELECT COUNT(*) FROM compliance_rules r WHERE r.act_id = a.id AND r.deleted_at IS NULL) AS rule_count,
        (SELECT COUNT(*) FROM compliance_regulations g WHERE g.act_id = a.id AND g.deleted_at IS NULL) AS regulation_count,
        (SELECT COUNT(*) FROM compliance_notifications n WHERE n.act_id = a.id AND n.deleted_at IS NULL) AS notification_count,
        (SELECT COUNT(*) FROM compliance_documents d WHERE d.act_id = a.id AND d.deleted_at IS NULL) AS document_count
     FROM compliance_acts a WHERE a.id = ? AND a.deleted_at IS NULL`,
    [actId]
  );
}

export async function actOptions(): Promise<{ value: string; label: string; hint?: string }[]> {
  const rows = await query<RowDataPacket>(
    `SELECT id, act_name, short_name, jurisdiction, state_name FROM compliance_acts
      WHERE deleted_at IS NULL AND status <> 'repealed'
      ORDER BY act_name ASC`
  );
  return rows.map((row) => ({
    value: String(row.id),
    label: row.short_name ? `${String(row.short_name)} — ${String(row.act_name)}` : String(row.act_name),
    hint: row.jurisdiction === 'State' && row.state_name ? String(row.state_name) : String(row.jurisdiction),
  }));
}

export async function actStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'active') AS active,
       SUM(status = 'amended') AS amended,
       SUM(jurisdiction = 'Central') AS central,
       SUM(jurisdiction = 'State') AS state,
       (SELECT COUNT(*) FROM compliance_rules WHERE deleted_at IS NULL AND status = 'active') AS rules,
       (SELECT COUNT(*) FROM compliance_regulations WHERE deleted_at IS NULL AND status = 'active') AS regulations,
       (SELECT COUNT(*) FROM compliance_notifications WHERE deleted_at IS NULL AND status = 'active') AS notifications,
       (SELECT COUNT(*) FROM compliance_documents WHERE deleted_at IS NULL) AS documents
     FROM compliance_acts WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    amended: Number(row?.amended ?? 0),
    central: Number(row?.central ?? 0),
    state: Number(row?.state ?? 0),
    rules: Number(row?.rules ?? 0),
    regulations: Number(row?.regulations ?? 0),
    notifications: Number(row?.notifications ?? 0),
    documents: Number(row?.documents ?? 0),
  };
}

export async function actStates(): Promise<string[]> {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT state_name FROM compliance_acts
      WHERE deleted_at IS NULL AND state_name IS NOT NULL ORDER BY state_name ASC`
  );
  return rows.map((row) => String(row.state_name));
}

export async function createAct(data: Record<string, SqlValue>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO compliance_acts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateAct(actId: number, data: Record<string, SqlValue>): Promise<void> {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  await execute(
    `UPDATE compliance_acts SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => data[column]), actId]
  );
}

export async function softDeleteAct(actId: number, userId: number): Promise<void> {
  await execute('UPDATE compliance_acts SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, actId]);
}

export async function actUsage(actId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM compliance_rules WHERE act_id = ? AND deleted_at IS NULL) AS rules,
       (SELECT COUNT(*) FROM compliance_regulations WHERE act_id = ? AND deleted_at IS NULL) AS regulations,
       (SELECT COUNT(*) FROM compliance_notifications WHERE act_id = ? AND deleted_at IS NULL) AS notifications,
       (SELECT COUNT(*) FROM compliance_documents WHERE act_id = ? AND deleted_at IS NULL) AS documents`,
    [actId, actId, actId, actId]
  );
  return {
    rules: Number(row?.rules ?? 0),
    regulations: Number(row?.regulations ?? 0),
    notifications: Number(row?.notifications ?? 0),
    documents: Number(row?.documents ?? 0),
  };
}

/* ══════════════════════════════════ rules ════════════════════════════════ */

export const RULE_COLUMNS = `r.id, r.act_id, r.rule_number, r.rule_title, r.rule_text, r.compliance_type, r.frequency,
  r.due_day_of_month, r.responsible_role, r.penalty_details, r.evidence_required, r.applicability, r.status,
  r.created_at, r.updated_at`;

const RULE_SORT = ['rule_title', 'rule_number', 'created_at', 'updated_at', 'frequency', 'compliance_type', 'status'];

export interface RuleListFilters extends ListQuery {
  act_id?: number | null;
  compliance_type?: string | null;
  frequency?: string | null;
  status?: string | null;
}

export async function findRules(filters: RuleListFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE r.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['r.rule_title', 'r.rule_number', 'r.rule_text', 'r.responsible_role'], params);
  if (filters.act_id) where += eqFilter('r.act_id', Number(filters.act_id), params);
  if (filters.compliance_type && filters.compliance_type !== 'all') where += eqFilter('r.compliance_type', filters.compliance_type, params);
  if (filters.frequency && filters.frequency !== 'all') where += eqFilter('r.frequency', filters.frequency, params);
  if (filters.status && filters.status !== 'all') where += eqFilter('r.status', filters.status, params);

  const joins = ' FROM compliance_rules r LEFT JOIN compliance_acts a ON a.id = r.act_id';
  const baseSql = `SELECT ${RULE_COLUMNS}, a.act_name, a.short_name AS act_short_name${joins}${where}`;
  const countSql = `SELECT COUNT(*)${joins}${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: RULE_SORT,
    defaultSort: 'created_at',
  });
}

export async function findRuleById(ruleId: number): Promise<RowDataPacket | null> {
  return queryOne<RowDataPacket>(
    `SELECT ${RULE_COLUMNS}, a.act_name, a.short_name AS act_short_name, a.jurisdiction,
        (SELECT COUNT(*) FROM compliance_regulations g WHERE g.rule_id = r.id AND g.deleted_at IS NULL) AS regulation_count
     FROM compliance_rules r LEFT JOIN compliance_acts a ON a.id = r.act_id
     WHERE r.id = ? AND r.deleted_at IS NULL`,
    [ruleId]
  );
}

export async function ruleOptions(actId?: number | null): Promise<{ value: string; label: string; hint?: string }[]> {
  const params: SqlValue[] = [];
  let where = ' WHERE r.deleted_at IS NULL AND r.status = \'active\'';
  if (actId) where += eqFilter('r.act_id', Number(actId), params);
  const rows = await query<RowDataPacket>(
    `SELECT r.id, r.rule_number, r.rule_title, a.short_name AS act_short_name
     FROM compliance_rules r LEFT JOIN compliance_acts a ON a.id = r.act_id${where}
     ORDER BY r.rule_number ASC, r.rule_title ASC`,
    params
  );
  return rows.map((row) => ({
    value: String(row.id),
    label: row.rule_number ? `${String(row.rule_number)} — ${String(row.rule_title)}` : String(row.rule_title),
    hint: row.act_short_name ? String(row.act_short_name) : undefined,
  }));
}

export async function ruleStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'active') AS active,
       SUM(compliance_type = 'Mandatory') AS mandatory,
       SUM(frequency IN ('Monthly','Quarterly','Half-Yearly','Annual','Bi-Annual')) AS periodic,
       SUM(frequency IS NULL) AS adHoc
     FROM compliance_rules WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    mandatory: Number(row?.mandatory ?? 0),
    periodic: Number(row?.periodic ?? 0),
    adHoc: Number(row?.adHoc ?? 0),
  };
}

export async function createRule(data: Record<string, SqlValue>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO compliance_rules (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateRule(ruleId: number, data: Record<string, SqlValue>): Promise<void> {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  await execute(
    `UPDATE compliance_rules SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => data[column]), ruleId]
  );
}

export async function softDeleteRule(ruleId: number, userId: number): Promise<void> {
  await execute('UPDATE compliance_rules SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, ruleId]);
}

export async function ruleUsage(ruleId: number): Promise<{ regulations: number }> {
  const row = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS regulations FROM compliance_regulations WHERE rule_id = ? AND deleted_at IS NULL',
    [ruleId]
  );
  return { regulations: Number(row?.regulations ?? 0) };
}

/* ═══════════════════════════════ regulations ═════════════════════════════ */

export const REGULATION_COLUMNS = `g.id, g.act_id, g.rule_id, g.regulation_name, g.regulation_number, g.issuing_authority,
  g.issue_date, g.effective_date, g.scope, g.obligations, g.reporting_authority, g.reporting_frequency,
  g.penalty_provision, g.status, g.created_at, g.updated_at`;

const REGULATION_SORT = ['regulation_name', 'regulation_number', 'issue_date', 'effective_date', 'created_at', 'updated_at', 'status'];

export interface RegulationListFilters extends ListQuery {
  act_id?: number | null;
  status?: string | null;
}

export async function findRegulations(filters: RegulationListFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE g.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['g.regulation_name', 'g.regulation_number', 'g.issuing_authority', 'g.reporting_authority'], params);
  if (filters.act_id) where += eqFilter('g.act_id', Number(filters.act_id), params);
  if (filters.status && filters.status !== 'all') where += eqFilter('g.status', filters.status, params);

  const joins = ` FROM compliance_regulations g
    LEFT JOIN compliance_acts a ON a.id = g.act_id
    LEFT JOIN compliance_rules r ON r.id = g.rule_id`;
  const baseSql = `SELECT ${REGULATION_COLUMNS}, a.act_name, a.short_name AS act_short_name,
      r.rule_number, r.rule_title${joins}${where}`;
  const countSql = `SELECT COUNT(*)${joins}${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: REGULATION_SORT,
    defaultSort: 'created_at',
  });
}

export async function findRegulationById(regulationId: number): Promise<RowDataPacket | null> {
  return queryOne<RowDataPacket>(
    `SELECT ${REGULATION_COLUMNS}, a.act_name, a.short_name AS act_short_name, r.rule_number, r.rule_title
     FROM compliance_regulations g
     LEFT JOIN compliance_acts a ON a.id = g.act_id
     LEFT JOIN compliance_rules r ON r.id = g.rule_id
     WHERE g.id = ? AND g.deleted_at IS NULL`,
    [regulationId]
  );
}

export async function regulationStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'active') AS active,
       SUM(status = 'superseded') AS superseded,
       SUM(reporting_authority IS NOT NULL) AS reporting,
       SUM(effective_date > CURDATE()) AS upcoming
     FROM compliance_regulations WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    superseded: Number(row?.superseded ?? 0),
    reporting: Number(row?.reporting ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
  };
}

export async function createRegulation(data: Record<string, SqlValue>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO compliance_regulations (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateRegulation(regulationId: number, data: Record<string, SqlValue>): Promise<void> {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  await execute(
    `UPDATE compliance_regulations SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => data[column]), regulationId]
  );
}

export async function softDeleteRegulation(regulationId: number, userId: number): Promise<void> {
  await execute('UPDATE compliance_regulations SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, regulationId]);
}

/* ═══════════════════════════ gazette notifications ══════════════════════ */

export const NOTIFICATION_REGISTER_COLUMNS = `n.id, n.notification_number, n.title, n.notification_date, n.issuing_authority,
  n.act_id, n.gazette_reference, n.subject, n.body, n.effective_date, n.applicability, n.action_required, n.status,
  n.created_at, n.updated_at`;

const NOTIFICATION_REGISTER_SORT = ['notification_number', 'title', 'notification_date', 'effective_date', 'created_at', 'updated_at', 'status'];

export interface NotificationRegisterFilters extends ListQuery {
  act_id?: number | null;
  status?: string | null;
  from_date?: string | null;
  to_date?: string | null;
}

export async function findNotificationRegister(filters: NotificationRegisterFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE n.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['n.notification_number', 'n.title', 'n.issuing_authority', 'n.gazette_reference', 'n.subject'], params);
  if (filters.act_id) where += eqFilter('n.act_id', Number(filters.act_id), params);
  if (filters.status && filters.status !== 'all') where += eqFilter('n.status', filters.status, params);
  if (filters.from_date) {
    where += ' AND DATE(COALESCE(n.notification_date, n.effective_date, n.created_at)) >= ?';
    params.push(String(filters.from_date));
  }
  if (filters.to_date) {
    where += ' AND DATE(COALESCE(n.notification_date, n.effective_date, n.created_at)) <= ?';
    params.push(String(filters.to_date));
  }

  const joins = ' FROM compliance_notifications n LEFT JOIN compliance_acts a ON a.id = n.act_id';
  const baseSql = `SELECT ${NOTIFICATION_REGISTER_COLUMNS}, a.act_name, a.short_name AS act_short_name${joins}${where}`;
  const countSql = `SELECT COUNT(*)${joins}${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: NOTIFICATION_REGISTER_SORT,
    defaultSort: 'notification_date',
  });
}

export async function findNotificationRegisterById(notificationId: number): Promise<RowDataPacket | null> {
  return queryOne<RowDataPacket>(
    `SELECT ${NOTIFICATION_REGISTER_COLUMNS}, a.act_name, a.short_name AS act_short_name
     FROM compliance_notifications n LEFT JOIN compliance_acts a ON a.id = n.act_id
     WHERE n.id = ? AND n.deleted_at IS NULL`,
    [notificationId]
  );
}

export async function notificationRegisterStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'active') AS active,
       SUM(action_required IS NOT NULL) AS actionable,
       SUM(effective_date > CURDATE()) AS upcoming,
       SUM(notification_date >= (CURDATE() - INTERVAL 90 DAY)) AS recent
     FROM compliance_notifications WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    actionable: Number(row?.actionable ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    recent: Number(row?.recent ?? 0),
  };
}

export async function createNotificationRegisterRow(data: Record<string, SqlValue>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO compliance_notifications (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateNotificationRegisterRow(notificationId: number, data: Record<string, SqlValue>): Promise<void> {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  await execute(
    `UPDATE compliance_notifications SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => data[column]), notificationId]
  );
}

export async function softDeleteNotificationRegisterRow(notificationId: number, userId: number): Promise<void> {
  await execute('UPDATE compliance_notifications SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, notificationId]);
}

/* ═════════════════════ compliance documents (legal register) ═════════════ */

/**
 * The derived status. Stored statuses are only ever `Valid`, `Expiring Soon`,
 * `Expired`, `Applied for Renewal` or `Not Applicable`; the CASE keeps an
 * operator's explicit "Applied for Renewal" / "Not Applicable" while letting the
 * calendar decide the rest.
 */
export const EFFECTIVE_STATUS_SQL = `CASE
    WHEN d.compliance_status IN ('Applied for Renewal', 'Not Applicable') THEN d.compliance_status
    WHEN d.expiry_date IS NULL THEN COALESCE(d.compliance_status, 'Valid')
    WHEN d.expiry_date < CURDATE() THEN 'Expired'
    WHEN DATEDIFF(d.expiry_date, CURDATE()) <= d.remind_days_before THEN 'Expiring Soon'
    ELSE 'Valid'
  END`;

export const DOCUMENT_COLUMNS = `d.id, d.uuid, d.document_name, d.document_type, d.employer_id, d.unit_id, d.act_id, d.rule_id,
  d.document_number, d.issuing_authority, d.issue_date, d.expiry_date, d.validity_period_days, d.remind_days_before,
  d.reminder_sent_at, d.renewal_responsibility, d.fee_amount, d.compliance_status, d.file_id, d.file_path,
  d.notes, d.is_verified, d.verified_by, d.verified_at, d.created_at, d.updated_at`;

const DOCUMENT_SORT = ['document_name', 'document_type', 'issue_date', 'expiry_date', 'created_at', 'updated_at', 'compliance_status'];

export interface DocumentListFilters extends ListQuery {
  employer_id?: number | null;
  unit_id?: number | null;
  document_type?: string | null;
  compliance_status?: string | null;
  act_id?: number | null;
  expiringWithin?: number | null;
  from_date?: string | null;
  to_date?: string | null;
}

export async function findDocuments(filters: DocumentListFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE d.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['d.document_name', 'd.document_number', 'd.issuing_authority', 'e.company_name'], params);
  if (filters.employer_id) where += eqFilter('d.employer_id', Number(filters.employer_id), params);
  if (filters.unit_id) where += eqFilter('d.unit_id', Number(filters.unit_id), params);
  if (filters.document_type && filters.document_type !== 'all') where += eqFilter('d.document_type', filters.document_type, params);
  if (filters.act_id) where += eqFilter('d.act_id', Number(filters.act_id), params);
  if (filters.compliance_status && filters.compliance_status !== 'all') {
    where += ` AND (${EFFECTIVE_STATUS_SQL}) = ?`;
    params.push(String(filters.compliance_status));
  }
  if (filters.expiringWithin) {
    where += ' AND d.expiry_date IS NOT NULL AND DATEDIFF(d.expiry_date, CURDATE()) BETWEEN 0 AND ?';
    params.push(Number(filters.expiringWithin));
  }
  if (filters.from_date) {
    where += ' AND d.expiry_date >= ?';
    params.push(String(filters.from_date));
  }
  if (filters.to_date) {
    where += ' AND d.expiry_date <= ?';
    params.push(String(filters.to_date));
  }

  const joins = ` FROM compliance_documents d
    JOIN employers e ON e.id = d.employer_id
    LEFT JOIN company_units u ON u.id = d.unit_id
    LEFT JOIN compliance_acts a ON a.id = d.act_id
    LEFT JOIN users vu ON vu.id = d.verified_by`;
  const baseSql = `SELECT ${DOCUMENT_COLUMNS}, (${EFFECTIVE_STATUS_SQL}) AS effective_status,
      DATEDIFF(d.expiry_date, CURDATE()) AS days_to_expiry,
      e.company_name, u.unit_name, a.act_name, a.short_name AS act_short_name,
      CONCAT(vu.first_name, ' ', COALESCE(vu.last_name, '')) AS verified_by_name,
      (SELECT COUNT(*) FROM files f WHERE f.id = d.file_id AND f.deleted_at IS NULL) AS has_file${joins}${where}`;
  const countSql = `SELECT COUNT(*)${joins}${where}`;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: DOCUMENT_SORT,
    defaultSort: 'expiry_date',
  });
}

export async function findDocumentById(documentId: number): Promise<RowDataPacket | null> {
  return queryOne<RowDataPacket>(
    `SELECT ${DOCUMENT_COLUMNS}, (${EFFECTIVE_STATUS_SQL}) AS effective_status,
        DATEDIFF(d.expiry_date, CURDATE()) AS days_to_expiry,
        e.company_name, e.employer_code, e.city AS employer_city, e.state AS employer_state,
        u.unit_name, a.act_name, a.short_name AS act_short_name, r.rule_title,
        CONCAT(vu.first_name, ' ', COALESCE(vu.last_name, '')) AS verified_by_name,
        f.original_name AS file_name, f.size_bytes AS file_size, f.mime_type AS file_mime_type
     FROM compliance_documents d
     JOIN employers e ON e.id = d.employer_id
     LEFT JOIN company_units u ON u.id = d.unit_id
     LEFT JOIN compliance_acts a ON a.id = d.act_id
     LEFT JOIN compliance_rules r ON r.id = d.rule_id
     LEFT JOIN users vu ON vu.id = d.verified_by
     LEFT JOIN files f ON f.id = d.file_id AND f.deleted_at IS NULL
     WHERE d.id = ? AND d.deleted_at IS NULL`,
    [documentId]
  );
}

export async function documentStats(employerId?: number | null) {
  const params: SqlValue[] = [];
  let scope = ' WHERE d.deleted_at IS NULL';
  if (employerId) scope += eqFilter('d.employer_id', Number(employerId), params);

  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM((${EFFECTIVE_STATUS_SQL}) = 'Valid') AS valid,
       SUM((${EFFECTIVE_STATUS_SQL}) = 'Expiring Soon') AS expiringSoon,
       SUM((${EFFECTIVE_STATUS_SQL}) = 'Expired') AS expired,
       SUM(d.compliance_status = 'Applied for Renewal') AS renewalApplied,
       SUM(d.is_verified = 1) AS verified,
       SUM(d.expiry_date IS NOT NULL AND DATEDIFF(d.expiry_date, CURDATE()) BETWEEN 0 AND 30) AS within30
     FROM compliance_documents d${scope}`,
    params
  );
  return {
    total: Number(row?.total ?? 0),
    valid: Number(row?.valid ?? 0),
    expiringSoon: Number(row?.expiringSoon ?? 0),
    expired: Number(row?.expired ?? 0),
    renewalApplied: Number(row?.renewalApplied ?? 0),
    verified: Number(row?.verified ?? 0),
    within30: Number(row?.within30 ?? 0),
  };
}

export async function documentTypeBreakdown(employerId?: number | null) {
  const params: SqlValue[] = [];
  let scope = ' WHERE d.deleted_at IS NULL';
  if (employerId) scope += eqFilter('d.employer_id', Number(employerId), params);
  const rows = await query<RowDataPacket>(
    `SELECT d.document_type,
        COUNT(*) AS total,
        SUM((${EFFECTIVE_STATUS_SQL}) = 'Expired') AS expired,
        SUM((${EFFECTIVE_STATUS_SQL}) = 'Expiring Soon') AS expiringSoon
     FROM compliance_documents d${scope}
     GROUP BY d.document_type ORDER BY total DESC`,
    params
  );
  return rows.map((row) => ({
    document_type: String(row.document_type),
    total: Number(row.total),
    expired: Number(row.expired ?? 0),
    expiringSoon: Number(row.expiringSoon ?? 0),
  }));
}

export async function expiringDocuments(withinDays = 90, limit = 50) {
  return query<RowDataPacket>(
    `SELECT ${DOCUMENT_COLUMNS}, (${EFFECTIVE_STATUS_SQL}) AS effective_status,
        DATEDIFF(d.expiry_date, CURDATE()) AS days_to_expiry, e.company_name, u.unit_name
     FROM compliance_documents d
     JOIN employers e ON e.id = d.employer_id
     LEFT JOIN company_units u ON u.id = d.unit_id
     WHERE d.deleted_at IS NULL AND d.expiry_date IS NOT NULL
       AND DATEDIFF(d.expiry_date, CURDATE()) BETWEEN 0 AND ?
       AND d.compliance_status <> 'Not Applicable'
     ORDER BY d.expiry_date ASC LIMIT ?`,
    [withinDays, limit]
  );
}

export async function createDocument(data: Record<string, SqlValue>): Promise<number> {
  const columns = Object.keys(data);
  return insert(
    `INSERT INTO compliance_documents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => data[column])
  );
}

export async function updateDocument(documentId: number, data: Record<string, SqlValue>): Promise<void> {
  const columns = Object.keys(data);
  if (columns.length === 0) return;
  await execute(
    `UPDATE compliance_documents SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => data[column]), documentId]
  );
}

export async function softDeleteDocument(documentId: number, userId: number): Promise<void> {
  await execute('UPDATE compliance_documents SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [userId, documentId]);
}

/** Writes the derived status back for rows that drifted since the last run. */
export async function syncExpiryStatuses(): Promise<number> {
  const rows = await query<RowDataPacket>(
    `SELECT d.id, (${EFFECTIVE_STATUS_SQL}) AS derived
     FROM compliance_documents d
     WHERE d.deleted_at IS NULL AND d.compliance_status <> (${EFFECTIVE_STATUS_SQL})`
  );
  for (const row of rows) {
    await execute('UPDATE compliance_documents SET compliance_status = ? WHERE id = ?', [String(row.derived), Number(row.id)]);
  }
  return rows.length;
}

/** Duplicate check used before insert so the register cannot hold the same licence twice. */
export async function findDuplicateDocument(employerId: number, documentType: string, documentNumber: string | null): Promise<RowDataPacket | null> {
  if (!documentNumber) return null;
  return queryOne<RowDataPacket>(
    `SELECT id, document_name, document_number FROM compliance_documents
      WHERE deleted_at IS NULL AND employer_id = ? AND document_type = ? AND document_number = ? LIMIT 1`,
    [employerId, documentType, documentNumber]
  );
}

export async function complianceDocumentCountFor(employerId: number): Promise<number> {
  return Number(await queryScalar<number>(
    'SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL',
    [employerId]
  ) ?? 0);
}

/** Employer/unit pickers for the document form. */
export async function employerPicker(search?: string | null) {
  const params: SqlValue[] = [];
  let where = ' WHERE e.deleted_at IS NULL';
  if (search && search.trim()) {
    const term = `%${escapeLike(search.trim())}%`;
    where += ' AND (e.company_name LIKE ? OR e.employer_code LIKE ?)';
    params.push(term, term);
  }
  return query<RowDataPacket>(
    `SELECT e.id, e.company_name, e.employer_code, e.city FROM employers e${where}
     ORDER BY e.company_name ASC LIMIT 50`,
    params
  );
}

export async function unitPicker(employerId: number) {
  return query<RowDataPacket>(
    'SELECT id, unit_name, unit_code FROM company_units WHERE employer_id = ? AND deleted_at IS NULL ORDER BY unit_name ASC',
    [employerId]
  );
}
