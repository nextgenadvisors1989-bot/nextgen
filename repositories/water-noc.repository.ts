/**
 * Groundwater NOC data access: the NOC, its conditions, the meters and their readings, and the legal-register row that
 * mirrors each NOC. Pure SQL; who may see or change what is decided in `services/water-noc.service.ts`.
 */
import { execute, insert, query, queryOne } from '@/lib/db/mysql';
import { setClause, type Row } from '@/repositories/capar.repository';

export type { Row };

/* ───────────────────────────── NOCs ───────────────────────────── */

const NOC_SELECT = `
  SELECT n.*, e.company_name AS employer_name, u.unit_name,
         (SELECT COUNT(*) FROM water_noc_conditions c WHERE c.noc_id = n.id AND c.deleted_at IS NULL) AS conditions_total,
         (SELECT COUNT(*) FROM water_noc_conditions c WHERE c.noc_id = n.id AND c.deleted_at IS NULL AND c.compliance = 'Compliant') AS conditions_compliant,
         (SELECT COUNT(*) FROM water_noc_conditions c WHERE c.noc_id = n.id AND c.deleted_at IS NULL AND c.compliance = 'Non-Compliant') AS conditions_non_compliant,
         (SELECT COUNT(*) FROM water_noc_conditions c WHERE c.noc_id = n.id AND c.deleted_at IS NULL AND c.compliance = 'Not Checked') AS conditions_unchecked
    FROM water_nocs n
    JOIN employers e ON e.id = n.employer_id
    LEFT JOIN company_units u ON u.id = n.unit_id`;

export function findNoc(id: number) {
  return queryOne<Row>(`${NOC_SELECT} WHERE n.id = ? AND n.deleted_at IS NULL`, [id]);
}

export interface NocListFilters {
  search?: string;
  employerId?: number;
  limit: number;
  offset: number;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE: Record<string, string> = { expiry_date: 'n.expiry_date', employer: 'e.company_name', noc_number: 'n.noc_number', approved: 'n.approved_quantity_lpd', updated_at: 'n.updated_at' };

export async function listNocs(filters: NocListFilters) {
  const where: string[] = ['n.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.search) {
    where.push('(n.noc_number LIKE ? OR n.title LIKE ? OR e.company_name LIKE ? OR n.issuing_authority LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }
  if (filters.employerId) { where.push('n.employer_id = ?'); params.push(filters.employerId); }
  const whereSql = where.join(' AND ');
  const sortColumn = SORTABLE[filters.sortBy ?? ''] ?? 'n.expiry_date';
  const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';

  const [totalRow, rows] = await Promise.all([
    queryOne<Row>(`SELECT COUNT(*) AS total FROM water_nocs n JOIN employers e ON e.id = n.employer_id WHERE ${whereSql}`, params),
    query<Row>(`${NOC_SELECT} WHERE ${whereSql} ORDER BY ${sortColumn} ${sortDir}, n.id DESC LIMIT ${Math.floor(filters.limit)} OFFSET ${Math.floor(filters.offset)}`, params),
  ]);
  return { total: Number(totalRow?.total ?? 0), rows };
}

const NOC_FIELDS = [
  'noc_number', 'title', 'unit_id', 'document_id', 'issuing_authority', 'applied_on', 'issue_date', 'expiry_date', 'renewal_cycle_years',
  'purpose', 'approved_quantity_lpd', 'purpose_domestic_lpd', 'purpose_gardening_lpd', 'purpose_other_lpd', 'well_type', 'well_depth_m',
  'well_diameter_in', 'pump_hp', 'pumping_hours_per_day', 'abstraction_structures', 'status', 'file_id', 'notes', 'updated_by',
] as const;

export function insertNoc(data: Record<string, unknown>) {
  const columns = Object.keys(data);
  return insert(`INSERT INTO water_nocs (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => data[c]));
}

export async function updateNoc(id: number, data: Record<string, unknown>) {
  const set = setClause(data, NOC_FIELDS);
  if (!set.sql) return;
  await execute(`UPDATE water_nocs SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function softDeleteNoc(id: number) {
  return execute('UPDATE water_nocs SET deleted_at = NOW() WHERE id = ?', [id]);
}

export function nocNumberTaken(employerId: number, nocNumber: string, exceptId?: number) {
  return queryOne<Row>(
    'SELECT id FROM water_nocs WHERE employer_id = ? AND LOWER(noc_number) = LOWER(?) AND deleted_at IS NULL AND id <> ?',
    [employerId, nocNumber, exceptId ?? 0]
  );
}

/* ───────────────────── the mirrored legal-register row ───────────────────── */

export function insertLegalDocument(data: Record<string, unknown>) {
  const columns = Object.keys(data);
  return insert(`INSERT INTO compliance_documents (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => data[c]));
}

const DOC_FIELDS = ['document_name', 'unit_id', 'document_number', 'issuing_authority', 'issue_date', 'expiry_date', 'compliance_status', 'file_id', 'notes', 'updated_by'] as const;

export async function updateLegalDocument(id: number, data: Record<string, unknown>) {
  const set = setClause(data, DOC_FIELDS);
  if (!set.sql) return;
  await execute(`UPDATE compliance_documents SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function softDeleteLegalDocument(id: number) {
  return execute('UPDATE compliance_documents SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── conditions ───────────────────────────── */

export function listConditions(nocId: number) {
  return query<Row>(
    `SELECT c.*, CONCAT_WS(' ', u.first_name, u.last_name) AS checked_by_name
       FROM water_noc_conditions c LEFT JOIN users u ON u.id = c.checked_by
      WHERE c.noc_id = ? AND c.deleted_at IS NULL ORDER BY c.sort_order, c.id`,
    [nocId]
  );
}

export function findCondition(id: number) {
  return queryOne<Row>('SELECT * FROM water_noc_conditions WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function nextConditionOrder(nocId: number) {
  const row = await queryOne<Row>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM water_noc_conditions WHERE noc_id = ? AND deleted_at IS NULL', [nocId]);
  return Number(row?.next ?? 10);
}

export function insertCondition(data: Record<string, unknown>) {
  const columns = Object.keys(data);
  return insert(`INSERT INTO water_noc_conditions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => data[c]));
}

export async function updateCondition(id: number, data: Record<string, unknown>) {
  const set = setClause(data, ['clause_no', 'condition_text', 'compliance', 'remarks', 'checked_by', 'checked_at', 'sort_order']);
  if (!set.sql) return;
  await execute(`UPDATE water_noc_conditions SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function softDeleteCondition(id: number) {
  return execute('UPDATE water_noc_conditions SET deleted_at = NOW() WHERE id = ?', [id]);
}

/* ───────────────────────────── meters and readings ───────────────────────────── */

export function listMeters(nocId: number) {
  return query<Row>(
    `SELECT m.*,
            (SELECT r.reading_date FROM water_meter_readings r WHERE r.meter_id = m.id ORDER BY r.reading_date DESC LIMIT 1) AS last_reading_date,
            (SELECT r.reading_value FROM water_meter_readings r WHERE r.meter_id = m.id ORDER BY r.reading_date DESC LIMIT 1) AS last_reading_value,
            (SELECT COUNT(*) FROM water_meter_readings r WHERE r.meter_id = m.id) AS reading_count
       FROM water_meters m WHERE m.noc_id = ? AND m.deleted_at IS NULL ORDER BY m.counts_toward_noc DESC, m.name`,
    [nocId]
  );
}

export function findMeter(id: number) {
  return queryOne<Row>('SELECT * FROM water_meters WHERE id = ? AND deleted_at IS NULL', [id]);
}

export function insertMeter(data: Record<string, unknown>) {
  const columns = Object.keys(data);
  return insert(`INSERT INTO water_meters (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => data[c]));
}

export async function updateMeter(id: number, data: Record<string, unknown>) {
  const set = setClause(data, ['name', 'source', 'reading_unit', 'counts_toward_noc', 'unit_id', 'status', 'notes']);
  if (!set.sql) return;
  await execute(`UPDATE water_meters SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function softDeleteMeter(id: number) {
  return execute('UPDATE water_meters SET deleted_at = NOW() WHERE id = ?', [id]);
}

export function listReadings(meterIds: number[], newestFirst = false) {
  if (!meterIds.length) return Promise.resolve([] as Row[]);
  return query<Row>(
    `SELECT r.id, r.meter_id, r.reading_date, r.reading_value, r.is_reset, r.remarks, r.entered_by,
            CONCAT_WS(' ', u.first_name, u.last_name) AS entered_by_name
       FROM water_meter_readings r LEFT JOIN users u ON u.id = r.entered_by
      WHERE r.meter_id IN (${meterIds.map(() => '?').join(', ')})
      ORDER BY r.meter_id, r.reading_date ${newestFirst ? 'DESC' : 'ASC'}
      LIMIT 20000`,
    meterIds
  );
}

export function findReading(id: number) {
  return queryOne<Row>('SELECT * FROM water_meter_readings WHERE id = ?', [id]);
}

export function readingOnDay(meterId: number, date: string, exceptId?: number) {
  return queryOne<Row>('SELECT id FROM water_meter_readings WHERE meter_id = ? AND reading_date = ? AND id <> ?', [meterId, date, exceptId ?? 0]);
}

export function previousReading(meterId: number, date: string, exceptId?: number) {
  return queryOne<Row>(
    'SELECT reading_date, reading_value, is_reset FROM water_meter_readings WHERE meter_id = ? AND reading_date < ? AND id <> ? ORDER BY reading_date DESC LIMIT 1',
    [meterId, date, exceptId ?? 0]
  );
}

export function nextReading(meterId: number, date: string, exceptId?: number) {
  return queryOne<Row>(
    'SELECT reading_date, reading_value, is_reset FROM water_meter_readings WHERE meter_id = ? AND reading_date > ? AND id <> ? ORDER BY reading_date ASC LIMIT 1',
    [meterId, date, exceptId ?? 0]
  );
}

export function insertReading(data: { meter_id: number; reading_date: string; reading_value: number; is_reset: boolean; remarks: string | null; entered_by: number }) {
  return insert(
    'INSERT INTO water_meter_readings (meter_id, reading_date, reading_value, is_reset, remarks, entered_by) VALUES (?, ?, ?, ?, ?, ?)',
    [data.meter_id, data.reading_date, data.reading_value, data.is_reset ? 1 : 0, data.remarks, data.entered_by]
  );
}

export async function updateReading(id: number, data: Record<string, unknown>) {
  const set = setClause(data, ['reading_date', 'reading_value', 'is_reset', 'remarks']);
  if (!set.sql) return;
  await execute(`UPDATE water_meter_readings SET ${set.sql} WHERE id = ?`, [...set.params, id]);
}

export function deleteReading(id: number) {
  return execute('DELETE FROM water_meter_readings WHERE id = ?', [id]);
}

/** Readings of every NOC-source meter for a set of NOCs (the list page's "recent usage" figures). */
export function sourceReadingsForNocs(nocIds: number[]) {
  if (!nocIds.length) return Promise.resolve([] as Row[]);
  return query<Row>(
    `SELECT m.noc_id, m.id AS meter_id, m.reading_unit, r.reading_date, r.reading_value, r.is_reset
       FROM water_meters m JOIN water_meter_readings r ON r.meter_id = m.id
      WHERE m.noc_id IN (${nocIds.map(() => '?').join(', ')}) AND m.counts_toward_noc = 1 AND m.status = 'active' AND m.deleted_at IS NULL
      ORDER BY m.noc_id, m.id, r.reading_date`,
    nocIds
  );
}

/* ───────────────────────────── lookups ───────────────────────────── */

export function lookupEmployers(search: string) {
  const term = `%${search}%`;
  return query<Row>(
    `SELECT id, company_name, employer_code, city FROM employers
      WHERE deleted_at IS NULL AND status = 'active' AND (company_name LIKE ? OR employer_code LIKE ?) ORDER BY company_name LIMIT 50`,
    [term, term]
  );
}

export function lookupUnits(employerId: number) {
  return query<Row>('SELECT id, unit_name, location FROM company_units WHERE employer_id = ? AND deleted_at IS NULL ORDER BY unit_name', [employerId]);
}

export function employerExists(id: number) {
  return queryOne<Row>('SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL', [id]);
}

export function unitBelongs(unitId: number, employerId: number) {
  return queryOne<Row>('SELECT id FROM company_units WHERE id = ? AND employer_id = ? AND deleted_at IS NULL', [unitId, employerId]);
}

export function isWaterAuditor(userId: number) {
  return queryOne<Row>(
    `SELECT a.id FROM auditors a JOIN auditor_types t ON t.id = a.auditor_type_id
      WHERE a.user_id = ? AND t.code = 'WATER' AND a.deleted_at IS NULL AND a.status = 'active'`,
    [userId]
  );
}
