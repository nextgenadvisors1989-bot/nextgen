/**
 * Designation Master.
 *
 * A designation with no employer is the shared master: administrators manage it. A designation with an employer_id belongs to that company:
 * its employer manages it, administrators can too. An employer sees the shared master (read-only) plus its own. An employee points at one by
 * `employees.designation_id`, and the employee's text columns (designation, and nature of work / skill grade when blank) follow it.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { designationQuerySchema, designationSchema, SKILL_LEVELS, STATUTORY_CATEGORIES } from '@/lib/validations/designation.validation';

export interface DesignationActor { userId: number; isAdmin: boolean; employerId: number | null }

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}
const invalid = (field: string, message: string): never => fail('Validation failed. Please correct the highlighted fields.', 'VALIDATION_FAILED', { issues: [{ field, message }] });
const n = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => (value === null || value === undefined ? null : Number(value));

const COLUMNS = `d.id, d.employer_id, e.company_name AS employer_name, d.industry_code, d.industry_name, d.group_name, d.designation_name, d.department, d.skill_level, d.level_inferred,
  d.nature_of_work, d.statutory_category, d.wage_basic, d.wage_da, d.wage_allowance, d.wage_ot, d.status, d.sort_order,
  (SELECT COUNT(*) FROM employees emp WHERE emp.designation_id = d.id AND emp.deleted_at IS NULL) AS employees_count`;

/** What a caller may see: administrators everything, an employer the shared master and its own. */
function visibility(actor: DesignationActor | null): { sql: string; params: unknown[] } {
  if (!actor || actor.isAdmin) return { sql: '1 = 1', params: [] };
  return { sql: '(d.employer_id IS NULL OR d.employer_id = ?)', params: [actor.employerId ?? -1] };
}

function present(row: RowDataPacket) {
  const basic = money(row.wage_basic), da = money(row.wage_da), allowance = money(row.wage_allowance);
  // Line 5 of the wage master: basic + VDA/DA + applicable allowances. Overtime is paid on top and is not part of it, and it is not the statutory minimum wage.
  const gross = basic === null && da === null && allowance === null ? null : Math.round(((basic ?? 0) + (da ?? 0) + (allowance ?? 0)) * 100) / 100;
  return { ...row, wage_basic: basic, wage_da: da, wage_allowance: allowance, wage_ot: money(row.wage_ot), wage_gross: gross, level_inferred: Boolean(row.level_inferred), employees_count: n(row.employees_count) };
}

export async function listDesignations(rawQuery: unknown, actor: DesignationActor) {
  const q = designationQuerySchema.parse(rawQuery);
  const vis = visibility(actor);
  const where = ['d.deleted_at IS NULL', vis.sql];
  const params: unknown[] = [...vis.params];
  if (q.search) { where.push('(d.designation_name LIKE ? OR d.department LIKE ? OR d.nature_of_work LIKE ? OR d.group_name LIKE ?)'); params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`, `%${q.search}%`); }
  if (q.industry) { where.push('d.industry_code = ?'); params.push(q.industry.toUpperCase()); }
  if (q.level) { where.push('d.skill_level = ?'); params.push(q.level); }
  if (q.department) { where.push('d.department = ?'); params.push(q.department); }
  if (q.status) { where.push('d.status = ?'); params.push(q.status); }
  if (q.scope === 'master') where.push('d.employer_id IS NULL');
  if (q.scope === 'company') where.push('d.employer_id IS NOT NULL');
  if (q.employer_id && actor.isAdmin) { where.push('d.employer_id = ?'); params.push(q.employer_id); }
  const total = n((await queryOne<RowDataPacket>(`SELECT COUNT(*) AS c FROM designations d WHERE ${where.join(' AND ')}`, params))?.c);
  const offset = (q.page - 1) * q.limit;
  const rows = await query<RowDataPacket>(
    `SELECT ${COLUMNS} FROM designations d LEFT JOIN employers e ON e.id = d.employer_id WHERE ${where.join(' AND ')}
      ORDER BY d.industry_code IS NULL, d.industry_code, d.sort_order, d.designation_name LIMIT ? OFFSET ?`, [...params, q.limit, offset]);
  const totalPages = Math.max(1, Math.ceil(total / q.limit));
  return { rows: rows.map(present), pagination: { total, page: q.page, limit: q.limit, totalPages, from: total ? offset + 1 : 0, to: Math.min(total, offset + q.limit) } };
}

export async function getDesignation(id: number, actor: DesignationActor) {
  const vis = visibility(actor);
  const row = await queryOne<RowDataPacket>(`SELECT ${COLUMNS} FROM designations d LEFT JOIN employers e ON e.id = d.employer_id WHERE d.id = ? AND d.deleted_at IS NULL AND ${vis.sql}`, [id, ...vis.params]);
  if (!row) fail('Designation not found', 'NOT_FOUND');
  return present(row!);
}

/** Filters and pick-lists for the screens: industries with counts, levels, departments, statutory categories. */
export async function designationLookups(actor: DesignationActor) {
  const vis = visibility(actor);
  const [industries, departments] = await Promise.all([
    query<RowDataPacket>(`SELECT d.industry_code AS code, MAX(d.industry_name) AS name, COUNT(*) AS count FROM designations d WHERE d.deleted_at IS NULL AND d.industry_code IS NOT NULL AND ${vis.sql} GROUP BY d.industry_code ORDER BY d.industry_code`, vis.params),
    query<RowDataPacket>(`SELECT DISTINCT d.department FROM designations d WHERE d.deleted_at IS NULL AND d.department IS NOT NULL AND ${vis.sql} ORDER BY d.department LIMIT 400`, vis.params),
  ]);
  return { industries: industries.map((r) => ({ code: String(r.code), name: String(r.name), count: n(r.count) })), levels: [...SKILL_LEVELS], categories: [...STATUTORY_CATEGORIES], departments: departments.map((r) => String(r.department)) };
}

/** Every active designation the caller can pick, in the shape the employee form needs. */
export async function designationPicker(actor: DesignationActor) {
  const vis = visibility(actor);
  const rows = await query<RowDataPacket>(
    `SELECT d.id, d.employer_id, d.industry_code, d.industry_name, d.group_name, d.designation_name, d.department, d.skill_level, d.nature_of_work, d.wage_basic, d.wage_da
       FROM designations d WHERE d.deleted_at IS NULL AND d.status = 'active' AND ${vis.sql} ORDER BY d.industry_code IS NULL, d.industry_code, d.sort_order, d.designation_name`, vis.params);
  return rows.map((r) => ({ id: n(r.id), employer_id: r.employer_id === null ? null : n(r.employer_id), industry_code: r.industry_code ?? null, industry_name: r.industry_name ?? null, group_name: r.group_name ?? null,
    name: String(r.designation_name), department: r.department ?? null, level: r.skill_level ?? null, nature: r.nature_of_work ?? null, basic: money(r.wage_basic), da: money(r.wage_da) }));
}

async function ensureUnique(input: ReturnType<typeof designationSchema.parse>, ignoreId?: number) {
  const dup = await queryOne<RowDataPacket>(
    `SELECT id FROM designations WHERE deleted_at IS NULL AND LOWER(designation_name) = LOWER(?) AND employer_id <=> ? AND industry_code <=> ? AND group_name <=> ? ${ignoreId ? 'AND id <> ?' : ''} LIMIT 1`,
    [input.designation_name, input.employer_id, input.industry_code, input.group_name, ...(ignoreId ? [ignoreId] : [])]);
  if (dup) fail('That designation already exists in this list', 'DUPLICATE');
}

function scoped(input: ReturnType<typeof designationSchema.parse>, actor: DesignationActor) {
  if (actor.isAdmin) return input;
  if (!actor.employerId) fail('Your login is not linked to a company', 'FORBIDDEN');
  return { ...input, employer_id: actor.employerId }; // an employer can only add to its own list, whatever the request says
}

export async function createDesignation(payload: unknown, actor: DesignationActor) {
  const input = scoped(designationSchema.parse(payload), actor);
  if (input.employer_id && !(await queryOne<RowDataPacket>('SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL', [input.employer_id]))) invalid('employer_id', 'That company does not exist');
  await ensureUnique(input);
  const order = n((await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM designations'))?.next);
  const result = await execute(
    `INSERT INTO designations (employer_id, industry_code, industry_name, group_name, designation_name, department, skill_level, nature_of_work, statutory_category, wage_basic, wage_da, wage_allowance, wage_ot, status, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.employer_id, input.industry_code, input.industry_name, input.group_name, input.designation_name, input.department, input.skill_level, input.nature_of_work, input.statutory_category,
      input.wage_basic, input.wage_da, input.wage_allowance, input.wage_ot, input.status, order, actor.userId]);
  return { id: result.insertId };
}

/** An employer may change only its own rows; the shared master is read-only to it. */
async function editable(id: number, actor: DesignationActor) {
  const row = await queryOne<RowDataPacket>('SELECT id, employer_id, designation_name FROM designations WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!row) fail('Designation not found', 'NOT_FOUND');
  if (!actor.isAdmin) {
    if (row!.employer_id === null) fail('The shared designation master can only be changed by an administrator. Add your own designation instead.', 'FORBIDDEN');
    if (n(row!.employer_id) !== actor.employerId) fail('Designation not found', 'NOT_FOUND');
  }
  return row!;
}

export async function updateDesignation(id: number, payload: unknown, actor: DesignationActor) {
  const current = await editable(id, actor);
  const parsed = designationSchema.parse(payload);
  // the owner of a designation never changes: a master row stays master, a company row stays that company's
  const input = { ...parsed, employer_id: current.employer_id === null ? null : n(current.employer_id) };
  await ensureUnique(input, id);
  await execute(
    `UPDATE designations SET industry_code = ?, industry_name = ?, group_name = ?, designation_name = ?, department = ?, skill_level = ?, level_inferred = 0, nature_of_work = ?, statutory_category = ?,
       wage_basic = ?, wage_da = ?, wage_allowance = ?, wage_ot = ?, status = ? WHERE id = ?`,
    [input.industry_code, input.industry_name, input.group_name, input.designation_name, input.department, input.skill_level, input.nature_of_work, input.statutory_category,
      input.wage_basic, input.wage_da, input.wage_allowance, input.wage_ot, input.status, id]);
  // employees that point at it keep showing its current name
  if (String(current.designation_name) !== input.designation_name) await execute('UPDATE employees SET designation = ? WHERE designation_id = ?', [input.designation_name, id]);
  return { id };
}

export async function deleteDesignation(id: number, actor: DesignationActor) {
  await editable(id, actor);
  const used = n((await queryOne<RowDataPacket>('SELECT COUNT(*) AS c FROM employees WHERE designation_id = ? AND deleted_at IS NULL', [id]))?.c);
  if (used > 0) fail(`${used} employee${used === 1 ? '' : 's'} use this designation, so it cannot be deleted. Mark it inactive instead.`, 'IN_USE');
  await execute('UPDATE designations SET deleted_at = NOW() WHERE id = ?', [id]);
}

/**
 * Used when an employee is saved with a designation_id: the designation must be one the employer may use, and the employee's text columns follow it
 * (the name always; nature of work, skill grade and department only when the form left them blank).
 */
export async function applyDesignation(data: Record<string, unknown>, employerId: number | null): Promise<void> {
  const id = data.designation_id;
  if (id === null || id === undefined || id === '') { data.designation_id = null; return; }
  const row = await queryOne<RowDataPacket>('SELECT id, employer_id, designation_name, department, skill_level, nature_of_work FROM designations WHERE id = ? AND deleted_at IS NULL AND status = \'active\'', [Number(id)]);
  if (!row || (row.employer_id !== null && n(row.employer_id) !== (employerId ?? -1))) invalid('designation_id', 'Choose a designation from the list');
  data.designation = String(row!.designation_name);
  if (!data.nature_of_work && row!.nature_of_work) data.nature_of_work = row!.nature_of_work;
  if (!data.skill_grade && row!.skill_level) data.skill_grade = row!.skill_level;
  if (!data.department && !data.department_id && row!.department) data.department = row!.department;
}
