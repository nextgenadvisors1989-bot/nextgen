/**
 * Data Management service: the employer's daily industrial data, its roll-ups, KPIs, balances and GHG figures.
 *
 * Who may do what:
 *   - the employer enters, corrects, verifies and deletes its own records;
 *   - an employee whose "data entry" switch the employer has turned on enters records and corrects its own unverified ones (it cannot verify);
 *   - the administrator and every auditor may read and export ANY company's records (an auditor may audit any company) but change nothing.
 * Every record of every register is checked against lib/data-management/registers.ts, calculated fields are re-worked on the server, a correction of a
 * verified record puts it back to "entered" and every write goes to the activity log (the audit trail of a data correction).
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { saveUploads, type UploadInput } from '@/lib/files/file-service';
import { REGISTERS, REGISTER_BY_CODE, type RegisterDef } from '@/lib/data-management/registers';
import { applyCalcs, bucketOf, cleanValues, fyLabel, fyRange, fyStartYear, isRealDate, isoOf, rollup, toKg, totals, type Granularity, type RollRow, type Values } from '@/lib/data-management/calc';
import { calculateGhg, type EmissionFactor, type Sources } from '@/lib/data-management/ghg';
import type { AuthUser } from '@/types/user';

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };
const fail = (code: string, message: string, issues?: { field: string; message: string }[]): ServiceError => Object.assign(new Error(message), { code, issues });

export interface Actor { user: AuthUser; ip?: string | null; userAgent?: string | null }

/* ───────────────────────────── scope and permissions ───────────────────────────── */

export interface Scope { employerId: number; companyName: string; canWrite: boolean; canVerify: boolean; viewer: 'employer' | 'employee' | 'auditor' | 'admin' }

const has = (user: AuthUser, permission: string) => user.permissions.includes('*') || user.permissions.includes(permission);

export async function resolveScope(user: AuthUser, requestedEmployerId?: number | null): Promise<Scope> {
  const slugs = user.roles.map((role) => role.slug);
  let employerId: number | null = null;
  let viewer: Scope['viewer'];
  if (slugs.includes('super_admin') || slugs.includes('admin')) { viewer = 'admin'; employerId = requestedEmployerId ?? null; }
  else if (slugs.includes('auditor')) { viewer = 'auditor'; employerId = requestedEmployerId ?? null; }
  else if (slugs.includes('employer')) { viewer = 'employer'; employerId = user.employerId ?? null; }
  else if (slugs.includes('employee')) {
    viewer = 'employee';
    const row = user.employeeId ? await queryOne<RowDataPacket>('SELECT employer_id FROM employees WHERE id = ? AND deleted_at IS NULL', [user.employeeId]) : null;
    employerId = row ? Number(row.employer_id) : null;
  } else throw fail('FORBIDDEN', 'Data Management is not available for your role');

  if (!has(user, 'data_management.read')) throw fail('FORBIDDEN', viewer === 'employee' ? 'Your employer has not switched data entry on for you' : 'You do not have access to Data Management');
  if (!employerId) throw fail('VALIDATION_FAILED', viewer === 'admin' || viewer === 'auditor' ? 'Choose the company whose data you want to see' : 'Your login is not linked to a company', [{ field: 'employer_id', message: 'Choose the company' }]);
  const employer = await queryOne<RowDataPacket>('SELECT id, company_name FROM employers WHERE id = ? AND deleted_at IS NULL', [employerId]);
  if (!employer) throw fail('NOT_FOUND', 'That company does not exist');
  const writer = viewer === 'employer' || viewer === 'employee';
  return {
    employerId, companyName: String(employer.company_name), viewer,
    canWrite: writer && has(user, 'data_management.create'),
    canVerify: viewer === 'employer' && has(user, 'data_management.verify'),
  };
}

function registerOf(code: string): RegisterDef {
  const register = REGISTER_BY_CODE[code];
  if (!register) throw fail('NOT_FOUND', `There is no register ${code}`);
  return register;
}

const parseData = (raw: unknown): Values => {
  if (raw && typeof raw === 'object') return raw as Values;
  try { return JSON.parse(String(raw ?? '{}')) as Values; } catch { return {}; }
};
const dateOnly = (value: unknown) => (value instanceof Date ? isoOf(new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))) : String(value ?? '').slice(0, 10));

export interface EntryRow {
  id: number; register_code: string; entry_date: string; shift: string | null; data: Values; remarks: string | null; status: string;
  verified_by: number | null; verified_at: string | null; verify_note: string | null; entered_by: number; entered_by_name: string | null; created_at: string; updated_at: string; files?: { id: number; file_id: number; caption: string | null; name: string; url: string }[];
}

const toEntry = (row: RowDataPacket): EntryRow => ({
  id: Number(row.id), register_code: String(row.register_code), entry_date: dateOnly(row.entry_date), shift: row.shift ? String(row.shift) : null, data: parseData(row.data),
  remarks: row.remarks ? String(row.remarks) : null, status: String(row.status), verified_by: row.verified_by ? Number(row.verified_by) : null,
  verified_at: row.verified_at ? String(row.verified_at) : null, verify_note: row.verify_note ? String(row.verify_note) : null, entered_by: Number(row.entered_by),
  entered_by_name: row.entered_by_name ? String(row.entered_by_name) : null, created_at: String(row.created_at), updated_at: String(row.updated_at),
});

const log = (actor: Actor, scope: Scope, action: string, entityId: number | null, description: string, extra: { old?: Record<string, unknown>; next?: Record<string, unknown> } = {}) =>
  writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole, employerId: scope.employerId, action, module: 'data_management', entityType: 'dm_entry',
    entityId, entityLabel: scope.companyName, description, oldValues: extra.old ?? null, newValues: extra.next ?? null, ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

/* ───────────────────────────── emission factors ───────────────────────────── */

const toFactor = (row: RowDataPacket): EmissionFactor => ({
  id: Number(row.id), ef_code: String(row.ef_code), name: String(row.name), activity_key: String(row.activity_key), scope: Number(row.scope), category: String(row.category), unit: String(row.unit),
  factor: Number(row.factor_kg_co2e), ncv: row.ncv_gj_per_unit === null || row.ncv_gj_per_unit === undefined ? null : Number(row.ncv_gj_per_unit), source: String(row.source),
  source_year: row.source_year ? Number(row.source_year) : null, version: row.version ? String(row.version) : null, valid_from: dateOnly(row.valid_from), valid_to: row.valid_to ? dateOnly(row.valid_to) : null,
  status: String(row.status), geography: row.geography ? String(row.geography) : null,
});

export async function listFactors(options: { approvedOnly?: boolean } = {}) {
  const rows = await query<RowDataPacket>(`SELECT * FROM dm_emission_factors WHERE deleted_at IS NULL ${options.approvedOnly ? "AND status = 'approved'" : ''} ORDER BY scope, activity_key, valid_from DESC`);
  return rows.map((row) => ({ ...toFactor(row), gases: row.gases ?? null, gwp_basis: row.gwp_basis ?? null, data_quality: row.data_quality ?? null, evidence: row.evidence ?? null, notes: row.notes ?? null, approved_at: row.approved_at ?? null }));
}

/** The keys an activity can have (what each register's activity maps to), for the administrator's form. */
export const ACTIVITY_KEYS: { key: string; label: string; scope: 1 | 2 | 3; unit: string }[] = [
  { key: 'fuel:diesel', label: 'Diesel (stationary or own vehicles)', scope: 1, unit: 'L' }, { key: 'fuel:petrol', label: 'Petrol', scope: 1, unit: 'L' }, { key: 'fuel:lpg', label: 'LPG', scope: 1, unit: 'kg' },
  { key: 'fuel:png', label: 'PNG', scope: 1, unit: 'SCM' }, { key: 'fuel:furnace-oil', label: 'Furnace oil', scope: 1, unit: 'L' }, { key: 'fuel:biomass', label: 'Biomass', scope: 1, unit: 'kg' },
  { key: 'fuel:coal', label: 'Coal', scope: 1, unit: 'kg' }, { key: 'fuel:cng', label: 'CNG (own vehicles)', scope: 1, unit: 'kg' },
  { key: 'electricity:grid', label: 'Grid electricity', scope: 2, unit: 'kWh' },
  { key: 'transport:hired', label: 'Hired transport work', scope: 3, unit: 'tonne-km' },
  { key: 'waste:landfill-tsdf', label: 'Waste to landfill / TSDF', scope: 3, unit: 'kg' }, { key: 'waste:incineration', label: 'Waste incineration', scope: 3, unit: 'kg' },
  { key: 'waste:co-processing', label: 'Waste co-processing', scope: 3, unit: 'kg' }, { key: 'waste:treatment', label: 'Waste treatment', scope: 3, unit: 'kg' }, { key: 'waste:other', label: 'Waste, other method', scope: 3, unit: 'kg' },
  { key: 'material:', label: 'A purchased material: type material: followed by its name in lower case with hyphens (for example material:cotton-yarn)', scope: 3, unit: 'kg' },
  { key: 'refrigerant:', label: 'A refrigerant (for GHG-01): refrigerant:r-22 ...', scope: 1, unit: 'kg' },
  { key: 'steam:purchased', label: 'Purchased steam / heat (for GHG-01)', scope: 2, unit: 'GJ' },
  { key: 'commute:', label: 'Employee commuting by mode (for GHG-01): commute:bus ...', scope: 3, unit: 'km' },
  { key: 'travel:', label: 'Business travel by mode (for GHG-01): travel:air ...', scope: 3, unit: 'km' },
];

export interface FactorInput {
  ef_code?: unknown; name?: unknown; activity_key?: unknown; scope?: unknown; category?: unknown; unit?: unknown; factor_kg_co2e?: unknown; ncv_gj_per_unit?: unknown; gases?: unknown; gwp_basis?: unknown;
  geography?: unknown; source?: unknown; source_year?: unknown; version?: unknown; valid_from?: unknown; valid_to?: unknown; data_quality?: unknown; evidence?: unknown; status?: unknown; notes?: unknown;
}

function cleanFactor(input: FactorInput) {
  const issues: { field: string; message: string }[] = [];
  const str = (key: keyof FactorInput, label: string, max: number, required = false) => {
    const value = String(input[key] ?? '').trim();
    if (required && !value) issues.push({ field: key, message: `${label} is needed` });
    return value.slice(0, max) || null;
  };
  const ef_code = str('ef_code', 'The factor code', 40, true);
  if (ef_code && !/^[A-Za-z0-9._-]+$/.test(ef_code)) issues.push({ field: 'ef_code', message: 'Use letters, numbers, dots, dashes and underscores only' });
  const name = str('name', 'The name', 200, true);
  const activity_key = str('activity_key', 'The activity', 80, true);
  if (activity_key && !/^[a-z0-9]+:[a-z0-9._-]*$/.test(activity_key)) issues.push({ field: 'activity_key', message: 'Write the activity as kind:name in lower case, for example fuel:diesel' });
  const scope = Number(input.scope);
  if (![1, 2, 3].includes(scope)) issues.push({ field: 'scope', message: 'Choose Scope 1, 2 or 3' });
  const category = str('category', 'The category', 60, true);
  const unit = str('unit', 'The unit the factor is per', 20, true);
  const factor = Number(input.factor_kg_co2e);
  if (!Number.isFinite(factor) || factor <= 0) issues.push({ field: 'factor_kg_co2e', message: 'The factor (kg CO2e per unit) must be a number above zero' });
  const ncvRaw = String(input.ncv_gj_per_unit ?? '').trim();
  const ncv = ncvRaw ? Number(ncvRaw) : null;
  if (ncv !== null && (!Number.isFinite(ncv) || ncv <= 0)) issues.push({ field: 'ncv_gj_per_unit', message: 'The calorific value must be a number above zero' });
  const source = str('source', 'The source (document, publisher)', 255, true);
  const yearRaw = String(input.source_year ?? '').trim();
  const source_year = yearRaw ? Number(yearRaw) : null;
  if (source_year !== null && (!Number.isInteger(source_year) || source_year < 1990 || source_year > 2100)) issues.push({ field: 'source_year', message: 'Enter the year of the source' });
  const valid_from = String(input.valid_from ?? '').slice(0, 10);
  if (!isRealDate(valid_from)) issues.push({ field: 'valid_from', message: 'Enter the date the factor starts to apply' });
  const validToRaw = String(input.valid_to ?? '').slice(0, 10);
  if (validToRaw && (!isRealDate(validToRaw) || validToRaw < valid_from)) issues.push({ field: 'valid_to', message: 'The end date must be a date on or after the start' });
  const status = String(input.status ?? 'draft');
  if (!['draft', 'approved', 'retired'].includes(status)) issues.push({ field: 'status', message: 'Choose draft, approved or retired' });
  if (issues.length) throw fail('VALIDATION_FAILED', 'Please correct the highlighted fields', issues);
  return {
    ef_code: ef_code!, name: name!, activity_key: activity_key!, scope, category: category!, unit: unit!, factor, ncv, gases: str('gases', 'Gases', 100), gwp_basis: str('gwp_basis', 'GWP basis', 20),
    geography: str('geography', 'Geography', 100), source: source!, source_year, version: str('version', 'Version', 30), valid_from, valid_to: validToRaw || null,
    data_quality: str('data_quality', 'Data quality', 40), evidence: str('evidence', 'Evidence', 255), status, notes: str('notes', 'Notes', 500),
  };
}

export async function saveFactor(actor: Actor, id: number | null, input: FactorInput) {
  const f = cleanFactor(input);
  const clash = await queryOne<RowDataPacket>('SELECT id FROM dm_emission_factors WHERE ef_code = ? AND id <> ?', [f.ef_code, id ?? 0]);
  if (clash) throw fail('DUPLICATE', `A factor with the code ${f.ef_code} already exists`, [{ field: 'ef_code', message: 'This code is already used' }]);
  const approved = f.status === 'approved';
  if (id) {
    const existing = await queryOne<RowDataPacket>('SELECT id, status FROM dm_emission_factors WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw fail('NOT_FOUND', 'Factor not found');
    await execute(
      `UPDATE dm_emission_factors SET ef_code=?, name=?, activity_key=?, scope=?, category=?, unit=?, factor_kg_co2e=?, ncv_gj_per_unit=?, gases=?, gwp_basis=?, geography=?, source=?, source_year=?, version=?,
        valid_from=?, valid_to=?, data_quality=?, evidence=?, status=?, notes=?, approved_by = CASE WHEN ? AND approved_by IS NULL THEN ? ELSE approved_by END, approved_at = CASE WHEN ? AND approved_at IS NULL THEN NOW() ELSE approved_at END WHERE id = ?`,
      [f.ef_code, f.name, f.activity_key, f.scope, f.category, f.unit, f.factor, f.ncv, f.gases, f.gwp_basis, f.geography, f.source, f.source_year, f.version, f.valid_from, f.valid_to, f.data_quality, f.evidence, f.status, f.notes, approved, actor.user.id, approved, id]
    );
  } else {
    id = await insert(
      `INSERT INTO dm_emission_factors (ef_code, name, activity_key, scope, category, unit, factor_kg_co2e, ncv_gj_per_unit, gases, gwp_basis, geography, source, source_year, version, valid_from, valid_to, data_quality, evidence, status, approved_by, approved_at, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [f.ef_code, f.name, f.activity_key, f.scope, f.category, f.unit, f.factor, f.ncv, f.gases, f.gwp_basis, f.geography, f.source, f.source_year, f.version, f.valid_from, f.valid_to, f.data_quality, f.evidence, f.status, approved ? actor.user.id : null, approved ? new Date() : null, f.notes, actor.user.id]
    );
  }
  await writeActivityLog({ userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole, action: 'updated', module: 'data_management', entityType: 'dm_emission_factor', entityId: id, entityLabel: f.ef_code, description: `Emission factor ${f.ef_code} (${f.name}) saved as ${f.status}`, newValues: { factor: f.factor, unit: f.unit, source: f.source }, ipAddress: actor.ip ?? null });
  return { id };
}

export async function deleteFactor(actor: Actor, id: number) {
  const row = await queryOne<RowDataPacket>('SELECT ef_code FROM dm_emission_factors WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) throw fail('NOT_FOUND', 'Factor not found');
  await execute('UPDATE dm_emission_factors SET deleted_at = NOW(), ef_code = CONCAT(ef_code, "~", id), status = "retired" WHERE id = ?', [id]);
  await writeActivityLog({ userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole, action: 'deleted', module: 'data_management', entityType: 'dm_emission_factor', entityId: id, entityLabel: String(row.ef_code), description: `Emission factor ${String(row.ef_code)} removed`, ipAddress: actor.ip ?? null });
}

/* ───────────────────────────── records ───────────────────────────── */

export interface ListFilters { register: string; from?: string; to?: string; status?: string; page?: number; limit?: number; q?: string }

export async function listEntries(user: AuthUser, employerId: number | null, filters: ListFilters) {
  const scope = await resolveScope(user, employerId);
  const register = registerOf(filters.register);
  const where = ['e.employer_id = ?', 'e.register_code = ?', 'e.deleted_at IS NULL'];
  const params: unknown[] = [scope.employerId, register.code];
  if (filters.from && isRealDate(filters.from)) { where.push('e.entry_date >= ?'); params.push(filters.from); }
  if (filters.to && isRealDate(filters.to)) { where.push('e.entry_date <= ?'); params.push(filters.to); }
  if (filters.status && ['entered', 'verified', 'rejected'].includes(filters.status)) { where.push('e.status = ?'); params.push(filters.status); }
  if (filters.q?.trim()) { where.push('(e.data LIKE ? OR e.remarks LIKE ?)'); params.push(`%${filters.q.trim()}%`, `%${filters.q.trim()}%`); }
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const [total] = await query<RowDataPacket>(`SELECT COUNT(*) AS n FROM dm_entries e WHERE ${where.join(' AND ')}`, params);
  const rows = await query<RowDataPacket>(
    `SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) AS entered_by_name, (SELECT COUNT(*) FROM dm_entry_files f WHERE f.entry_id = e.id) AS file_count
       FROM dm_entries e LEFT JOIN users u ON u.id = e.entered_by WHERE ${where.join(' AND ')} ORDER BY e.entry_date DESC, e.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params
  );
  return { scope, register, rows: rows.map((row) => ({ ...toEntry(row), file_count: Number(row.file_count ?? 0) })), pagination: { total: Number(total?.n ?? 0), page, limit, totalPages: Math.max(Math.ceil(Number(total?.n ?? 0) / limit), 1) } };
}

async function loadEntry(scope: Scope, id: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) AS entered_by_name FROM dm_entries e LEFT JOIN users u ON u.id = e.entered_by WHERE e.id = ? AND e.employer_id = ? AND e.deleted_at IS NULL`,
    [id, scope.employerId]
  );
  if (!row) throw fail('NOT_FOUND', 'Record not found');
  return toEntry(row);
}

export async function getEntry(user: AuthUser, employerId: number | null, id: number) {
  const scope = await resolveScope(user, employerId);
  const entry = await loadEntry(scope, id);
  const files = await query<RowDataPacket>(
    `SELECT f.id, f.file_id, f.caption, v.original_name FROM dm_entry_files f JOIN files v ON v.id = f.file_id AND v.deleted_at IS NULL WHERE f.entry_id = ? ORDER BY f.id`, [id]);
  return { scope, entry: { ...entry, files: files.map((f) => ({ id: Number(f.id), file_id: Number(f.file_id), caption: f.caption ? String(f.caption) : null, name: String(f.original_name), url: `/api/files/${f.file_id}/download` })) } };
}

async function efCodeSet(): Promise<Set<string>> {
  const rows = await query<RowDataPacket>("SELECT ef_code FROM dm_emission_factors WHERE deleted_at IS NULL AND status <> 'retired'");
  return new Set(rows.map((row) => String(row.ef_code)));
}

function cleanHeader(input: { entry_date?: unknown; shift?: unknown; remarks?: unknown }, register: RegisterDef) {
  const issues: { field: string; message: string }[] = [];
  const entry_date = String(input.entry_date ?? '').slice(0, 10);
  if (!isRealDate(entry_date)) issues.push({ field: 'entry_date', message: 'Enter the date of the record' });
  else if (entry_date > isoOf(new Date(Date.now() + 5.5 * 3600_000 + 86400_000))) issues.push({ field: 'entry_date', message: 'The date cannot be in the future' });
  const shift = register.shift ? String(input.shift ?? '').trim().toUpperCase().slice(0, 10) || null : null;
  if (shift && !['A', 'B', 'C', 'GENERAL'].includes(shift)) issues.push({ field: 'shift', message: 'Choose shift A, B, C or General' });
  const remarks = String(input.remarks ?? '').trim().slice(0, 500) || null;
  return { entry_date, shift, remarks, issues };
}

export interface EntryInput { entry_date?: unknown; shift?: unknown; remarks?: unknown; values?: unknown }

export async function createEntry(actor: Actor, employerId: number | null, registerCode: string, input: EntryInput) {
  const scope = await resolveScope(actor.user, employerId);
  if (!scope.canWrite) throw fail('FORBIDDEN', 'You can read these records but not enter them');
  const register = registerOf(registerCode);
  const head = cleanHeader(input, register);
  const { values, issues } = cleanValues(register, (input.values && typeof input.values === 'object' ? input.values : {}) as Values, await efCodeSet());
  const all = [...head.issues, ...issues];
  if (all.length) throw fail('VALIDATION_FAILED', 'Please correct the highlighted fields', all);
  const id = await insert(
    'INSERT INTO dm_entries (employer_id, register_code, entry_date, shift, data, remarks, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [scope.employerId, register.code, head.entry_date, head.shift, JSON.stringify(values), head.remarks, actor.user.id]
  );
  await log(actor, scope, 'created', id, `${register.code} record of ${head.entry_date} entered`, { next: { ...values, entry_date: head.entry_date } });
  return { id, values };
}

export async function updateEntry(actor: Actor, employerId: number | null, id: number, input: EntryInput) {
  const scope = await resolveScope(actor.user, employerId);
  const entry = await loadEntry(scope, id);
  const register = registerOf(entry.register_code);
  if (!scope.canWrite) throw fail('FORBIDDEN', 'You can read these records but not change them');
  if (scope.viewer === 'employee' && (entry.entered_by !== actor.user.id || entry.status === 'verified')) throw fail('FORBIDDEN', 'You can correct only your own records, and only until the employer has verified them');
  const head = cleanHeader({ entry_date: input.entry_date ?? entry.entry_date, shift: input.shift ?? entry.shift, remarks: input.remarks ?? entry.remarks }, register);
  const { values, issues } = cleanValues(register, (input.values && typeof input.values === 'object' ? input.values : {}) as Values, await efCodeSet());
  const all = [...head.issues, ...issues];
  if (all.length) throw fail('VALIDATION_FAILED', 'Please correct the highlighted fields', all);
  await execute(
    `UPDATE dm_entries SET entry_date = ?, shift = ?, data = ?, remarks = ?, status = 'entered', verified_by = NULL, verified_at = NULL, verify_note = NULL, updated_by = ? WHERE id = ?`,
    [head.entry_date, head.shift, JSON.stringify(values), head.remarks, actor.user.id, id]
  );
  await log(actor, scope, 'updated', id, `${register.code} record of ${entry.entry_date} corrected${entry.status === 'verified' ? ' (it was verified, so it needs verifying again)' : ''}`,
    { old: { ...entry.data, entry_date: entry.entry_date, status: entry.status }, next: { ...values, entry_date: head.entry_date } });
  return { id, values };
}

export async function deleteEntry(actor: Actor, employerId: number | null, id: number) {
  const scope = await resolveScope(actor.user, employerId);
  const entry = await loadEntry(scope, id);
  if (!scope.canWrite) throw fail('FORBIDDEN', 'You can read these records but not delete them');
  if (scope.viewer === 'employee') throw fail('FORBIDDEN', 'Only the employer can delete a record');
  if (!has(actor.user, 'data_management.delete')) throw fail('FORBIDDEN', 'You may not delete records');
  await execute('UPDATE dm_entries SET deleted_at = NOW(), updated_by = ? WHERE id = ?', [actor.user.id, id]);
  await log(actor, scope, 'deleted', id, `${entry.register_code} record of ${entry.entry_date} deleted`, { old: { ...entry.data, entry_date: entry.entry_date } });
}

export async function verifyEntry(actor: Actor, employerId: number | null, id: number, input: { decision?: unknown; note?: unknown }) {
  const scope = await resolveScope(actor.user, employerId);
  if (!scope.canVerify) throw fail('FORBIDDEN', 'Only the employer verifies records');
  const entry = await loadEntry(scope, id);
  const decision = String(input.decision ?? 'verify');
  if (!['verify', 'reject', 'reopen'].includes(decision)) throw fail('VALIDATION_FAILED', 'Choose verify, reject or reopen');
  const note = String(input.note ?? '').trim().slice(0, 300) || null;
  if (decision === 'reject' && !note) throw fail('VALIDATION_FAILED', 'Say why the record is rejected', [{ field: 'note', message: 'Write the reason' }]);
  const status = decision === 'verify' ? 'verified' : decision === 'reject' ? 'rejected' : 'entered';
  await execute('UPDATE dm_entries SET status = ?, verified_by = ?, verified_at = ?, verify_note = ? WHERE id = ?', [status, status === 'entered' ? null : actor.user.id, status === 'entered' ? null : new Date(), note, id]);
  await log(actor, scope, 'updated', id, `${entry.register_code} record of ${entry.entry_date} ${status}`, { old: { status: entry.status }, next: { status, note } });
  return { id, status };
}

/** Values already used in this register for fields that offer suggestions (materials, suppliers, products ...). */
export async function suggestions(user: AuthUser, employerId: number | null, registerCode: string) {
  const scope = await resolveScope(user, employerId);
  const register = registerOf(registerCode);
  const keys = register.fields.filter((field) => field.suggest).map((field) => field.key);
  if (!keys.length) return {};
  const rows = await query<RowDataPacket>('SELECT data FROM dm_entries WHERE employer_id = ? AND register_code = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1500', [scope.employerId, register.code]);
  const found: Record<string, Set<string>> = Object.fromEntries(keys.map((key) => [key, new Set<string>()]));
  for (const row of rows) {
    const data = parseData(row.data);
    for (const key of keys) { const v = data[key]; if (typeof v === 'string' && v.trim()) found[key].add(v); }
  }
  return Object.fromEntries(keys.map((key) => [key, [...found[key]].sort().slice(0, 100)]));
}

/** The efficient way to attach a meter photo, weighbridge slip or invoice to a record. */
export async function attachFiles(actor: Actor, employerId: number | null, id: number, files: UploadInput[], caption: string | null) {
  const scope = await resolveScope(actor.user, employerId);
  const entry = await loadEntry(scope, id);
  if (!scope.canWrite) throw fail('FORBIDDEN', 'You can read these records but not attach files');
  if (scope.viewer === 'employee' && entry.entered_by !== actor.user.id) throw fail('FORBIDDEN', 'You can attach files only to your own records');
  const saved = await saveUploads(files, { entityType: 'OTHER', entityId: id, category: 'Data Management', accessLevel: 'private', description: caption }, { user: actor.user, ip: actor.ip ?? undefined });
  for (const file of saved) await insert('INSERT INTO dm_entry_files (entry_id, file_id, caption, created_by) VALUES (?, ?, ?, ?)', [id, file.id, caption, actor.user.id]);
  await log(actor, scope, 'updated', id, `${saved.length} file(s) attached to the ${entry.register_code} record of ${entry.entry_date}`);
  return saved.length;
}

export async function removeFile(actor: Actor, employerId: number | null, id: number, linkId: number) {
  const scope = await resolveScope(actor.user, employerId);
  const entry = await loadEntry(scope, id);
  if (!scope.canWrite || (scope.viewer === 'employee' && entry.entered_by !== actor.user.id)) throw fail('FORBIDDEN', 'You cannot remove this file');
  await execute('DELETE FROM dm_entry_files WHERE id = ? AND entry_id = ?', [linkId, id]);
}

/* ───────────────────────────── summary: roll-ups, KPIs, balances ───────────────────────────── */

async function rowsIn(employerId: number, from: string, to: string, codes?: string[]): Promise<Map<string, RollRow[]>> {
  const list = codes ?? REGISTERS.map((register) => register.code);
  const rows = await query<RowDataPacket>(
    `SELECT id, register_code, entry_date, data FROM dm_entries WHERE employer_id = ? AND deleted_at IS NULL AND entry_date BETWEEN ? AND ? AND register_code IN (${list.map(() => '?').join(',')}) ORDER BY entry_date, id LIMIT 200000`,
    [employerId, from, to, ...list]
  );
  const map = new Map<string, RollRow[]>(list.map((code) => [code, []]));
  for (const row of rows) map.get(String(row.register_code))?.push({ id: Number(row.id), entry_date: dateOnly(row.entry_date), data: parseData(row.data) });
  return map;
}

const sum = (rows: RollRow[], key: string, filter?: (row: RollRow) => boolean) => rows.reduce((total, row) => (filter && !filter(row) ? total : total + (typeof row.data[key] === 'number' ? (row.data[key] as number) : 0)), 0);
const count = (rows: RollRow[], key: string) => rows.filter((row) => typeof row.data[key] === 'number').length;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);
const per = (part: number, whole: number, digits = 2) => (whole > 0 ? Math.round((part / whole) * 10 ** digits) / 10 ** digits : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

function waterQty(row: RollRow): number {
  const q = row.data.qty_kl;
  if (typeof q === 'number') return q;
  const open = row.data.meter_opening, close = row.data.meter_closing;
  return typeof open === 'number' && typeof close === 'number' && close >= open ? close - open : 0;
}

/** The newest record of each item (material, waste name, requirement ...) in a register. */
function latestBy(rows: RollRow[], key: string): RollRow[] {
  const map = new Map<string, RollRow>();
  for (const row of rows) map.set(`${String(row.data[key] ?? '')}|${String(row.data.uom ?? '')}`, row);
  return [...map.values()];
}

export interface Kpi { key: string; label: string; value: number | null; unit: string; how: string; note?: string; section: string }

export function computeKpis(rows: Map<string, RollRow[]>, ghgKg: number, today: string): { kpis: Kpi[]; figures: Record<string, number> } {
  const g = (code: string) => rows.get(code) ?? [];
  const pro = g('PRO-01');
  const productionKg = sum(pro, 'total_production');
  const productionMt = productionKg / 1000;
  const days = new Set(pro.filter((row) => (row.data.total_production as number) > 0).map((row) => row.entry_date)).size;
  const capacity = Math.max(0, ...g('FG-01').map((row) => (typeof row.data.capacity_per_day === 'number' ? row.data.capacity_per_day : 0)));
  const rmKg = count(pro, 'rm_consumed') ? sum(pro, 'rm_consumed')
    : g('RM-02').reduce((total, row) => total + (toKg(row.data.net_issued, row.data.uom) ?? 0), 0);
  const rejected = sum(pro, 'rejected');
  const fresh = g('WAT-01').filter((row) => row.data.kind === 'Intake (source)' && !/recycl/i.test(String(row.data.name ?? ''))).reduce((t, row) => t + waterQty(row), 0);
  const recycledIn = g('WAT-01').filter((row) => row.data.kind === 'Intake (source)' && /recycl/i.test(String(row.data.name ?? ''))).reduce((t, row) => t + waterQty(row), 0);
  const electricity = sum(g('ENR-01'), 'consumption');
  const wasteGen = sum(g('WST-01'), 'qty_kg') + sum(g('WST-02'), 'qty_kg') + sum(g('WAT-02'), 'sludge_kg');
  const route = (name: string) => sum(g('WST-03'), 'qty_kg', (row) => row.data.route === name);
  const disposal = sum(g('WST-04'), 'qty_kg');
  const tonneKm = sum(g('TRN-01'), 'tonne_km') + sum(g('TRN-02'), 'tonne_km');
  const inv = latestBy(g('INV-01'), 'material');
  const invBook = inv.reduce((t, row) => t + ((row.data.closing_book as number) || 0), 0);
  const invVar = inv.reduce((t, row) => t + (typeof row.data.variance === 'number' ? Math.abs(row.data.variance as number) : 0), 0);
  const cmp = latestBy(g('CMP-01'), 'requirement').filter((row) => row.data.compliance_status !== 'Not applicable');
  const capa = g('CAPA-01');
  const capaClosed = capa.filter((row) => row.data.action_status === 'Closed').length;
  const capaOverdue = capa.filter((row) => row.data.action_status !== 'Closed' && typeof row.data.due_date === 'string' && (row.data.due_date as string) < today).length;
  const hazGen = sum(g('WST-02'), 'qty_kg');
  const hazOut = sum(g('WST-03'), 'qty_kg', (row) => row.data.waste_type === 'Hazardous') + sum(g('WST-04'), 'qty_kg', (row) => row.data.waste_type === 'Hazardous');

  const K = (section: string, key: string, label: string, value: number | null, unit: string, how: string, note?: string): Kpi => ({ section, key, label, value, unit, how, note });
  const kpis: Kpi[] = [
    K('Production', 'production', 'Production', productionKg ? r2(productionMt) : null, 'MT', 'Sum of total production (PRO-01)'),
    K('Production', 'achievement', 'Production achievement', capacity && days ? pct(productionKg, capacity * days) : null, '%', 'Actual production / (installed capacity x operating days) x 100', capacity ? undefined : 'Enter the installed capacity in the finished goods register (FG-01).'),
    K('Production', 'rm_consumed', 'Raw material consumed', rmKg ? r2(rmKg / 1000) : null, 'MT', 'Raw material consumed in production (PRO-01; RM-02 if PRO-01 has none)'),
    K('Production', 'material_intensity', 'Material intensity', per(rmKg, productionMt), 'kg per MT of product', 'Raw material consumed / production'),
    K('Production', 'rejection', 'Product rejection', pct(rejected, productionKg), '%', 'Rejected / total production x 100'),
    K('Inventory', 'inventory_variance', 'Inventory variance', pct(invVar, invBook), '%', 'Sum of stock variances (physical - book) / book stock, latest count of each material'),
    K('Resources', 'water', 'Fresh water drawn', fresh ? r2(fresh) : null, 'KL', 'Sum of intake from fresh sources (WAT-01)'),
    K('Resources', 'water_intensity', 'Water intensity', per(fresh, productionMt), 'KL per MT', 'Fresh water / production'),
    K('Resources', 'electricity', 'Electricity consumed', electricity ? r2(electricity) : null, 'kWh', 'Sum of consumption (ENR-01)'),
    K('Resources', 'electricity_intensity', 'Electricity intensity', per(electricity, productionMt), 'kWh per MT', 'Electricity / production'),
    K('Waste', 'waste', 'Waste generated', wasteGen ? r2(wasteGen / 1000) : null, 'MT', 'Solid + hazardous waste + ETP sludge'),
    K('Waste', 'waste_intensity', 'Waste generation intensity', per(wasteGen, productionMt), 'kg per MT', 'Waste generated / production'),
    K('Waste', 'recycling', 'Waste recycling rate', pct(route('Recycling'), wasteGen), '%', 'Recycled / waste generated x 100'),
    K('Waste', 'recovery', 'Waste recovery rate', pct(route('Recovery'), wasteGen), '%', 'Recovered / waste generated x 100'),
    K('Waste', 'reuse', 'Waste reuse rate', pct(route('Reuse'), wasteGen), '%', 'Reused / waste generated x 100'),
    K('Waste', 'disposal_rate', 'Waste disposal rate', pct(disposal, wasteGen), '%', 'Disposed / waste generated x 100'),
    K('Waste', 'disposal', 'Waste sent for disposal', disposal ? r2(disposal / 1000) : null, 'MT', 'Sum of disposal (WST-04)'),
    K('Waste', 'hazardous_balance', 'Hazardous waste added to stock', hazGen || hazOut ? r2((hazGen - hazOut) / 1000) : null, 'MT', 'Hazardous generated - hazardous reused/recycled/recovered/disposed in the period'),
    K('Transport', 'tonne_km', 'Transport work', tonneKm ? r2(tonneKm) : null, 'tonne-km', 'Net tonnes x distance, incoming + outgoing'),
    K('Transport', 'transport_intensity', 'Transport intensity', per(tonneKm, productionMt), 'tonne-km per MT', 'Transport work / production'),
    K('GHG', 'ghg', 'GHG emissions', ghgKg ? r2(ghgKg / 1000) : null, 'tCO2e', 'Activity data x emission factor, Scope 1 + 2 + 3 (only activities that have an approved factor)'),
    K('GHG', 'ghg_intensity', 'GHG intensity', per(ghgKg / 1000, productionMt, 3), 'tCO2e per MT', 'Total GHG / production'),
    K('Compliance', 'compliance', 'Statutory compliance', cmp.length ? pct(cmp.filter((row) => row.data.compliance_status === 'Compliant').length, cmp.length) : null, '%', 'Compliant items / items that apply (CMP-01)'),
    K('Compliance', 'capa_closure', 'CAPA closure', capa.length ? pct(capaClosed, capa.length) : null, '%', 'Closed actions / all actions (CAPA-01)', capaOverdue ? `${capaOverdue} open action(s) are past their due date.` : undefined),
  ];
  return { kpis, figures: { productionKg, rmKg, fresh, recycledIn, wasteGen, disposal, capaOverdue } };
}

export function computeBalances(rows: Map<string, RollRow[]>, figures: Record<string, number>) {
  const g = (code: string) => rows.get(code) ?? [];
  const goodKg = sum(g('PRO-01'), 'good_production');
  const solidWaste = sum(g('WST-01'), 'qty_kg') + sum(g('WST-02'), 'qty_kg');
  const byproducts = sum(g('AUD-01'), 'byproducts_kg'), wwMaterial = sum(g('AUD-01'), 'wastewater_material_kg'), otherLoss = sum(g('AUD-01'), 'other_loss_kg'), accumulation = sum(g('AUD-01'), 'accumulation_kg');
  const input = figures.rmKg;
  const output = goodKg + byproducts + solidWaste + wwMaterial + otherLoss;
  const material = {
    input, lines: [
      { label: 'Finished products (accepted)', kg: goodKg }, { label: 'Reusable by-products', kg: byproducts }, { label: 'Solid and hazardous waste', kg: solidWaste },
      { label: 'Material carried in wastewater', kg: wwMaterial }, { label: 'Other measured losses and emissions', kg: otherLoss }, { label: 'Accumulation (work in progress, stock, tanks)', kg: accumulation },
    ],
    unexplained: input ? r2(input - output - accumulation) : null, closure_pct: input ? pct(output + accumulation, input) : null,
  };
  const wat2 = g('WAT-02');
  const waterIn = figures.fresh + figures.recycledIn;
  const outs = { product: sum(wat2, 'product_water_kl'), evaporation: sum(wat2, 'evaporation_kl'), wastewater: sum(wat2, 'wastewater_kl'), other: sum(wat2, 'other_loss_kl'), storage: sum(wat2, 'storage_change_kl') };
  const use = g('WAT-01').filter((row) => row.data.kind === 'Use (department)').reduce((t, row) => t + waterQty(row), 0);
  const water = {
    input: r2(waterIn), fresh: r2(figures.fresh), recycled: r2(figures.recycledIn),
    outputs: [{ label: 'Water in product', kl: outs.product }, { label: 'Evaporation', kl: outs.evaporation }, { label: 'Wastewater generated', kl: outs.wastewater }, { label: 'Other losses', kl: outs.other }, { label: 'Change in storage', kl: outs.storage }],
    difference: waterIn ? r2(waterIn - (outs.product + outs.evaporation + outs.wastewater + outs.other + outs.storage)) : null,
    wastewater_pct: pct(outs.wastewater, waterIn), recycled_pct: pct(sum(wat2, 'reuse_kl') + figures.recycledIn, use || waterIn), departments: aggregate(g('WAT-01').filter((row) => row.data.kind === 'Use (department)'), 'name', waterQty),
    sources: aggregate(g('WAT-01').filter((row) => row.data.kind === 'Intake (source)'), 'name', waterQty),
  };
  const route = (name: string) => sum(g('WST-03'), 'qty_kg', (row) => row.data.route === name);
  const waste = {
    generated: r2(figures.wasteGen), reuse: r2(route('Reuse')), recycling: r2(route('Recycling')), recovery: r2(route('Recovery')), disposal: r2(figures.disposal),
    to_account_for: r2(figures.wasteGen - route('Reuse') - route('Recycling') - route('Recovery') - figures.disposal),
    by_stream: aggregate([...g('WST-01'), ...g('WST-02')], 'waste_type', (row) => (row.data.qty_kg as number) || 0, 'Hazardous'),
  };
  const stock = latestBy(g('INV-01'), 'material').map((row) => ({ material: String(row.data.material ?? ''), uom: String(row.data.uom ?? ''), book: (row.data.closing_book as number) ?? null, physical: (row.data.physical as number) ?? null, variance: (row.data.variance as number) ?? null, variance_pct: (row.data.variance_pct as number) ?? null, date: row.entry_date }));
  return { material, water, waste, stock };
}

function aggregate(rows: RollRow[], key: string, value: (row: RollRow) => number, fallback = ''): { name: string; total: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) { const name = String(row.data[key] ?? fallback) || '(not named)'; map.set(name, (map.get(name) ?? 0) + value(row)); }
  return [...map.entries()].map(([name, total]) => ({ name, total: r2(total) })).sort((a, b) => b.total - a.total);
}

/** Entries that stand out against the rest of the same register and item: more than twice the average and three standard deviations above it. */
export function exceptions(rows: Map<string, RollRow[]>): { register: string; date: string; field: string; item: string; value: number; average: number }[] {
  const KEY: Record<string, [string, string]> = { 'PUR-01': ['net_qty', 'material'], 'PRO-01': ['total_production', 'product_code'], 'ENR-01': ['consumption', 'meter_name'], 'ENR-02': ['consumed', 'fuel'], 'WAT-01': ['qty_kl', 'name'], 'WST-01': ['qty_kg', 'waste_type'], 'WST-02': ['qty_kg', 'name'], 'TRN-01': ['net_kg', 'vehicle_no'], 'TRN-02': ['net_kg', 'vehicle_no'] };
  const out: { register: string; date: string; field: string; item: string; value: number; average: number }[] = [];
  for (const [code, [field, item]] of Object.entries(KEY)) {
    const groups = new Map<string, RollRow[]>();
    for (const row of rows.get(code) ?? []) { const k = String(row.data[item] ?? ''); groups.set(k, [...(groups.get(k) ?? []), row]); }
    for (const [name, list] of groups) {
      const values = list.map((row) => row.data[field]).filter((v): v is number => typeof v === 'number');
      if (values.length < 8) continue;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      for (const row of list) {
        const v = row.data[field];
        if (typeof v === 'number' && v > mean + 3 * sd && v >= 2 * mean && v > 0) out.push({ register: code, date: row.entry_date, field, item: name, value: v, average: r2(mean) });
      }
    }
  }
  for (const row of rows.get('INV-01') ?? []) {
    const p = row.data.variance_pct;
    if (typeof p === 'number' && Math.abs(p) > 5) out.push({ register: 'INV-01', date: row.entry_date, field: 'variance_pct', item: String(row.data.material ?? ''), value: p, average: 0 });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
}

export async function ghgFor(employerId: number, from: string, to: string) {
  const rows = await rowsIn(employerId, from, to, ['ENR-01', 'ENR-02', 'TRN-01', 'TRN-02', 'WST-04', 'PUR-01', 'GHG-01']);
  const factors = (await listFactors({ approvedOnly: false })).map((f) => ({ ...f }));
  const src = Object.fromEntries([...rows.entries()]) as unknown as Sources;
  return calculateGhg(src, factors);
}

export interface PeriodInput { from?: string; to?: string }

/** The default period: the current financial year so far. */
export function resolvePeriod(input: PeriodInput, now = new Date()) {
  const today = isoOf(new Date(now.getTime() + 5.5 * 3600_000));
  const fy = fyRange(fyStartYear(today));
  const from = input.from && isRealDate(input.from) ? input.from : fy.from;
  const to = input.to && isRealDate(input.to) ? input.to : today < fy.to ? today : fy.to;
  if (from > to) throw fail('VALIDATION_FAILED', 'The start of the period is after its end', [{ field: 'from', message: 'The start must be on or before the end' }]);
  return { from, to, today, label: `${from} to ${to}`, fy: fyLabel(fyStartYear(from)) };
}

export async function summary(user: AuthUser, employerId: number | null, input: PeriodInput) {
  const scope = await resolveScope(user, employerId);
  const period = resolvePeriod(input);
  const rows = await rowsIn(scope.employerId, period.from, period.to);
  const ghg = await ghgFor(scope.employerId, period.from, period.to);
  const { kpis, figures } = computeKpis(rows, ghg.totalKg, period.today);
  const counts = Object.fromEntries([...rows.entries()].map(([code, list]) => [code, list.length]));
  const pending = await queryOne<RowDataPacket>("SELECT COUNT(*) AS n FROM dm_entries WHERE employer_id = ? AND deleted_at IS NULL AND status = 'entered' AND entry_date BETWEEN ? AND ?", [scope.employerId, period.from, period.to]);
  const rejected = await queryOne<RowDataPacket>("SELECT COUNT(*) AS n FROM dm_entries WHERE employer_id = ? AND deleted_at IS NULL AND status = 'rejected' AND entry_date BETWEEN ? AND ?", [scope.employerId, period.from, period.to]);
  const wat2 = rows.get('WAT-02') ?? [];
  const etp = ['ph', 'bod', 'cod', 'tss', 'tds', 'oil_grease'].map((key) => {
    const values = wat2.map((row) => row.data[key]).filter((v): v is number => typeof v === 'number');
    return { parameter: key, n: values.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, avg: values.length ? r2(values.reduce((a, b) => a + b, 0) / values.length) : null };
  });
  return {
    scope, period, counts, kpis, balances: computeBalances(rows, figures), etp, exceptions: exceptions(rows),
    ghg: { scopeT: { 1: r2(ghg.scopeKg[1] / 1000), 2: r2(ghg.scopeKg[2] / 1000), 3: r2(ghg.scopeKg[3] / 1000) }, totalT: r2(ghg.totalKg / 1000), missing: ghg.missing, notes: ghg.notes },
    verification: { awaiting: Number(pending?.n ?? 0), rejected: Number(rejected?.n ?? 0) },
  };
}

export async function ghgReport(user: AuthUser, employerId: number | null, input: PeriodInput) {
  const scope = await resolveScope(user, employerId);
  const period = resolvePeriod(input);
  const ghg = await ghgFor(scope.employerId, period.from, period.to);
  const production = (await rowsIn(scope.employerId, period.from, period.to, ['PRO-01'])).get('PRO-01') ?? [];
  const mt = sum(production, 'total_production') / 1000;
  return { scope, period, ghg, totalT: r2(ghg.totalKg / 1000), intensity: per(ghg.totalKg / 1000, mt, 3), productionMt: r2(mt) };
}

export async function series(user: AuthUser, employerId: number | null, registerCode: string, granularity: Granularity, input: PeriodInput) {
  const scope = await resolveScope(user, employerId);
  const register = registerOf(registerCode);
  const period = resolvePeriod(input);
  const rows = (await rowsIn(scope.employerId, period.from, period.to, [register.code])).get(register.code) ?? [];
  const buckets = rollup(register, rows, granularity);
  let split: { value: string; count: number; values: Record<string, number | null> }[] = [];
  if (register.splitBy) {
    const groups = new Map<string, RollRow[]>();
    for (const row of rows) { const k = String(row.data[register.splitBy] ?? '') || '(not named)'; groups.set(k, [...(groups.get(k) ?? []), row]); }
    split = [...groups.entries()].map(([value, list]) => ({ value, count: list.length, values: totals(register, list) }));
  }
  return { scope, period, register: register.code, granularity, buckets, total: totals(register, rows), count: rows.length, split };
}

/** Records of a period as plain rows for CSV export. */
export async function exportRows(user: AuthUser, employerId: number | null, registerCode: string, input: PeriodInput) {
  const scope = await resolveScope(user, employerId);
  if (!has(user, 'data_management.export') && scope.viewer !== 'employer') throw fail('FORBIDDEN', 'You may not export these records');
  const register = registerOf(registerCode);
  const period = resolvePeriod(input);
  const rows = await query<RowDataPacket>(
    `SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) AS entered_by_name FROM dm_entries e LEFT JOIN users u ON u.id = e.entered_by
      WHERE e.employer_id = ? AND e.register_code = ? AND e.deleted_at IS NULL AND e.entry_date BETWEEN ? AND ? ORDER BY e.entry_date, e.id LIMIT 50000`, [scope.employerId, register.code, period.from, period.to]);
  return { scope, register, period, rows: rows.map(toEntry) };
}

export { applyCalcs, bucketOf };
