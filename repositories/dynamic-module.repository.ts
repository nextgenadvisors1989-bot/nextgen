/**
 * Data access for the dynamic-module engine: modules, forms, the nested form
 * structure (sections → fields → options, tables → columns) and the role/user
 * assignments that decide who may fill a module in.
 *
 * The builder saves the whole structure in one call, so `replaceStructure` runs
 * inside a transaction: rows that disappeared are soft-deleted (`deleted_at`) and
 * rows that came back with an id are resurrected — historic submissions keep
 * pointing at the field labels they were answered against.
 */
import { insert, query, queryOne, queryScalar, transaction, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction } from '@/lib/db/transactions';
import { buildOrderBy, buildSearch, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';
import type { FormStructurePayload } from '@/lib/validations/dynamic-module.validation';

export interface ModuleRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  version: string;
  module_type: string;
  default_tat_days: number | null;
  requires_verification: boolean;
  is_public: boolean;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface FormRow extends RowDataPacket {
  id: number;
  module_id: number;
  name: string;
  slug: string;
  description: string | null;
  form_type: string;
  version: number;
  layout_columns: number;
  requires_signature: boolean;
  requires_attachments: boolean;
  allow_draft: boolean;
  auto_number_prefix: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SectionRow extends RowDataPacket {
  id: number;
  form_id: number;
  title: string;
  section_code: string | null;
  description: string | null;
  layout_columns: number;
  is_repeatable: boolean;
  is_collapsible: boolean;
  is_collapsed: boolean;
  show_in_pdf: boolean;
  page_break_before: boolean;
  sort_order: number;
  status: string;
}

export interface FieldRow extends RowDataPacket {
  id: number;
  form_id: number;
  section_id: number;
  field_key: string;
  label: string;
  label_ta: string | null;
  field_type: string;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  options_json: string | Record<string, unknown>[] | null;
  validation_json: string | Record<string, unknown> | null;
  conditional_json: string | Record<string, unknown> | null;
  table_definition_id: number | null;
  formula_expression: string | null;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  show_in_pdf: boolean;
  show_in_list: boolean;
  column_width: number;
  min_value: string | number | null;
  max_value: string | number | null;
  min_length: number | null;
  max_length: number | null;
  regex_pattern: string | null;
  sort_order: number;
  status: string;
}

export interface OptionRow extends RowDataPacket {
  id: number;
  field_id: number;
  option_key: string;
  option_label: string;
  option_label_ta: string | null;
  option_value: string | null;
  color: string | null;
  score: string | number | null;
  is_default: boolean;
  sort_order: number;
  status: string;
}

export interface TableRow extends RowDataPacket {
  id: number;
  form_id: number;
  section_id: number | null;
  table_key: string;
  table_name: string;
  table_name_ta: string | null;
  description: string | null;
  is_repeatable: boolean;
  min_rows: number;
  max_rows: number | null;
  show_row_numbers: boolean;
  show_totals: boolean;
  show_in_pdf: boolean;
  sort_order: number;
  status: string;
}

export interface ColumnRow extends RowDataPacket {
  id: number;
  table_id: number;
  column_key: string;
  column_label: string;
  column_label_ta: string | null;
  column_type: string;
  options_json: string | Record<string, unknown>[] | null;
  formula_expression: string | null;
  default_value: string | null;
  width_pct: string | number | null;
  is_required: boolean;
  is_editable: boolean;
  is_sortable: boolean;
  is_total: boolean;
  show_in_pdf: boolean;
  validation_json: string | Record<string, unknown> | null;
  sort_order: number;
  status: string;
}

const MODULE_COLUMNS = `m.id, m.name, m.slug, m.description, m.icon, m.category, m.version, m.module_type,
  m.default_tat_days, m.requires_verification, m.is_public, m.sort_order, m.status, m.created_at, m.updated_at`;

const FORM_COLUMNS = `f.id, f.module_id, f.name, f.slug, f.description, f.form_type, f.version, f.layout_columns,
  f.requires_signature, f.requires_attachments, f.allow_draft, f.auto_number_prefix, f.status, f.created_at, f.updated_at`;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

/* ─────────────────────────────── modules ───────────────────────────────── */

export const MODULE_SORT_COLUMNS = ['created_at', 'name', 'status', 'sort_order', 'module_type', 'updated_at'];

export async function listModules(filters: Record<string, unknown>): Promise<{ data: ModuleRow[]; pagination: { total: number; page: number; limit: number; totalPages: number; from: number; to: number } }> {
  const params: SqlValue[] = [];
  let where = ' WHERE m.deleted_at IS NULL';
  where += buildSearch(filters.search as string | undefined, ['m.name', 'm.slug', 'm.category', 'm.description'], params);
  if (filters.status) {
    where += ' AND m.status = ?';
    params.push(String(filters.status));
  }
  if (filters.module_type) {
    where += ' AND m.module_type = ?';
    params.push(String(filters.module_type));
  }
  if (filters.category) {
    where += ' AND m.category = ?';
    params.push(String(filters.category));
  }

  const baseSql = `SELECT ${MODULE_COLUMNS},
      (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL) AS form_count,
      (SELECT COUNT(*) FROM dynamic_form_submissions s WHERE s.module_id = m.id AND s.deleted_at IS NULL) AS submission_count,
      (SELECT COUNT(*) FROM dynamic_module_role_assignments ra WHERE ra.module_id = m.id) AS role_count
    FROM dynamic_modules m${where}`;
  const countSql = `SELECT COUNT(*) FROM dynamic_modules m${where}`;

  return paginatedQuery<ModuleRow>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: MODULE_SORT_COLUMNS,
    defaultSort: 'sort_order',
  });
}

export async function moduleStats(): Promise<{ total: number; published: number; draft: number; archived: number; forms: number; submissions: number; awaitingReview: number }> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM dynamic_modules WHERE deleted_at IS NULL) AS total,
       (SELECT COUNT(*) FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'published') AS published,
       (SELECT COUNT(*) FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'draft') AS draft,
       (SELECT COUNT(*) FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'archived') AS archived,
       (SELECT COUNT(*) FROM dynamic_forms WHERE deleted_at IS NULL) AS forms,
       (SELECT COUNT(*) FROM dynamic_form_submissions WHERE deleted_at IS NULL) AS submissions,
       (SELECT COUNT(*) FROM dynamic_form_submissions WHERE deleted_at IS NULL AND status IN ('submitted','under_review','changes_requested')) AS awaitingReview`
  );
  return {
    total: Number(row?.total ?? 0),
    published: Number(row?.published ?? 0),
    draft: Number(row?.draft ?? 0),
    archived: Number(row?.archived ?? 0),
    forms: Number(row?.forms ?? 0),
    submissions: Number(row?.submissions ?? 0),
    awaitingReview: Number(row?.awaitingReview ?? 0),
  };
}

export async function findModuleById(moduleId: number): Promise<ModuleRow | null> {
  return queryOne<ModuleRow>(
    `SELECT ${MODULE_COLUMNS},
        (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL) AS form_count,
        (SELECT COUNT(*) FROM dynamic_form_submissions s WHERE s.module_id = m.id AND s.deleted_at IS NULL) AS submission_count
     FROM dynamic_modules m WHERE m.id = ? AND m.deleted_at IS NULL`,
    [moduleId]
  );
}

export async function findModuleBySlug(slug: string, excludeId?: number): Promise<ModuleRow | null> {
  const params: SqlValue[] = [slug];
  let sql = 'SELECT id, name, slug FROM dynamic_modules WHERE slug = ? AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  return queryOne<ModuleRow>(sql, params);
}

export async function createModule(data: Record<string, unknown>): Promise<number> {
  return insert(
    `INSERT INTO dynamic_modules
      (name, slug, description, icon, category, version, module_type, default_tat_days, requires_verification,
       is_public, sort_order, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name, data.slug, data.description ?? null, data.icon ?? null, data.category ?? null,
      data.version ?? '1.0', data.module_type, data.default_tat_days ?? null,
      data.requires_verification ? 1 : 0, data.is_public ? 1 : 0, data.sort_order ?? 0,
      data.status ?? 'draft', data.user_id ?? null, data.user_id ?? null,
    ]
  );
}

export async function updateModule(moduleId: number, data: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE dynamic_modules SET name = ?, slug = ?, description = ?, icon = ?, category = ?, version = ?,
        module_type = ?, default_tat_days = ?, requires_verification = ?, is_public = ?, sort_order = ?,
        status = ?, updated_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      data.name, data.slug, data.description ?? null, data.icon ?? null, data.category ?? null,
      data.version ?? '1.0', data.module_type, data.default_tat_days ?? null,
      data.requires_verification ? 1 : 0, data.is_public ? 1 : 0, data.sort_order ?? 0,
      data.status ?? 'draft', data.user_id ?? null, moduleId,
    ]
  );
}

export async function setModuleStatus(moduleId: number, status: string, userId: number | null): Promise<void> {
  await query('UPDATE dynamic_modules SET status = ?, updated_by = ? WHERE id = ?', [status, userId, moduleId]);
}

export async function touchModuleVersion(moduleId: number, version: string, userId: number | null): Promise<void> {
  await query('UPDATE dynamic_modules SET version = ?, updated_by = ? WHERE id = ?', [version, userId, moduleId]);
}

export async function softDeleteModule(moduleId: number): Promise<void> {
  await query('UPDATE dynamic_modules SET deleted_at = NOW() WHERE id = ?', [moduleId]);
}

export async function restoreModule(moduleId: number): Promise<void> {
  await query('UPDATE dynamic_modules SET deleted_at = NULL WHERE id = ?', [moduleId]);
}

export async function moduleOptions(): Promise<{ value: number; label: string; hint: string | null }[]> {
  const rows = await query<RowDataPacket>(
    `SELECT id, name, module_type, status,
        (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL) AS form_count
     FROM dynamic_modules m WHERE deleted_at IS NULL AND status <> 'archived'
     ORDER BY sort_order ASC, name ASC`
  );
  return rows.map((row) => ({
    value: Number(row.id),
    label: String(row.name),
    hint: `${row.module_type} · ${row.form_count} form(s) · ${row.status}`,
  }));
}

/** How much history hangs off a module — the delete guard reads this. */
export async function moduleUsage(moduleId: number): Promise<{ forms: number; submissions: number }> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM dynamic_forms WHERE module_id = ? AND deleted_at IS NULL) AS forms,
       (SELECT COUNT(*) FROM dynamic_form_submissions WHERE module_id = ? AND deleted_at IS NULL) AS submissions`,
    [moduleId, moduleId]
  );
  return { forms: Number(row?.forms ?? 0), submissions: Number(row?.submissions ?? 0) };
}

/* ───────────────────────────── assignments ─────────────────────────────── */

export interface RoleAssignmentRow extends RowDataPacket {
  id: number;
  module_id: number;
  role_id: number;
  role_slug: string;
  role_name: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export async function roleAssignmentsFor(moduleId: number): Promise<RoleAssignmentRow[]> {
  return query<RoleAssignmentRow>(
    `SELECT ra.id, ra.module_id, ra.role_id, r.slug AS role_slug, r.name AS role_name,
        ra.can_create, ra.can_read, ra.can_update, ra.can_delete, ra.can_approve
     FROM dynamic_module_role_assignments ra
     JOIN roles r ON r.id = ra.role_id
     WHERE ra.module_id = ?
     ORDER BY r.name ASC`,
    [moduleId]
  );
}

export interface UserAssignmentRow extends RowDataPacket {
  id: number;
  module_id: number;
  user_id: number;
  auditor_id: number | null;
  user_name: string;
  user_email: string;
  role_slug: string | null;
}

export async function userAssignmentsFor(moduleId: number): Promise<UserAssignmentRow[]> {
  return query<UserAssignmentRow>(
    `SELECT ua.id, ua.module_id, ua.user_id, ua.auditor_id,
        CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS user_name, u.email AS user_email,
        (SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role_slug
     FROM dynamic_module_user_assignments ua
     JOIN users u ON u.id = ua.user_id
     WHERE ua.module_id = ?
     ORDER BY u.first_name ASC`,
    [moduleId]
  );
}

export async function replaceRoleAssignments(
  moduleId: number,
  rows: { role: string; can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean; can_approve: boolean }[],
  grantedBy: number | null
): Promise<void> {
  await transaction(async (conn) => {
    await conn.query('DELETE FROM dynamic_module_role_assignments WHERE module_id = ?', [moduleId]);
    for (const row of rows) {
      const role = await conn.query<RowDataPacket[]>('SELECT id FROM roles WHERE slug = ?', [row.role]);
      const roleId = role[0]?.[0]?.id;
      if (!roleId) continue;
      await conn.query(
        `INSERT INTO dynamic_module_role_assignments
          (module_id, role_id, can_create, can_read, can_update, can_delete, can_approve, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [moduleId, roleId, row.can_create ? 1 : 0, row.can_read ? 1 : 0, row.can_update ? 1 : 0,
          row.can_delete ? 1 : 0, row.can_approve ? 1 : 0, grantedBy]
      );
    }
  });
}

export async function replaceUserAssignments(
  moduleId: number,
  rows: { user_id: number; auditor_id?: number | null }[],
  assignedBy: number | null
): Promise<void> {
  await transaction(async (conn) => {
    await conn.query('DELETE FROM dynamic_module_user_assignments WHERE module_id = ?', [moduleId]);
    for (const row of rows) {
      await conn.query(
        `INSERT INTO dynamic_module_user_assignments (module_id, user_id, auditor_id, assigned_by)
         VALUES (?, ?, ?, ?)`,
        [moduleId, row.user_id, row.auditor_id ?? null, assignedBy]
      );
    }
  });
}

export interface ModuleAccess {
  role: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

/** What this user's role + direct assignment allow on this module. */
export async function moduleAccessFor(moduleId: number, userId: number, roleSlug: string | null): Promise<ModuleAccess | null> {
  const direct = await queryOne<RowDataPacket>(
    'SELECT id FROM dynamic_module_user_assignments WHERE module_id = ? AND user_id = ?',
    [moduleId, userId]
  );
  if (direct) {
    return { role: roleSlug ?? 'user', can_create: true, can_read: true, can_update: true, can_delete: false, can_approve: false };
  }
  if (!roleSlug) return null;
  if (roleSlug === 'auditor') {
    // An auditor works only the forms mapped to their auditor type (or assigned to them by name).
    const mapped = await queryOne<RowDataPacket>(
      `SELECT atm.id FROM auditor_type_modules atm
         JOIN auditors a ON a.auditor_type_id = atm.auditor_type_id AND a.user_id = ? AND a.deleted_at IS NULL
        WHERE atm.module_id = ? LIMIT 1`,
      [userId, moduleId]
    );
    return mapped
      ? { role: 'auditor', can_create: true, can_read: true, can_update: true, can_delete: false, can_approve: false }
      : null;
  }
  const row = await queryOne<RowDataPacket>(
    `SELECT ra.can_create, ra.can_read, ra.can_update, ra.can_delete, ra.can_approve
     FROM dynamic_module_role_assignments ra
     JOIN roles r ON r.id = ra.role_id
     WHERE ra.module_id = ? AND r.slug = ?`,
    [moduleId, roleSlug]
  );
  if (!row) return null;
  return {
    role: roleSlug,
    can_create: Boolean(row.can_create),
    can_read: Boolean(row.can_read),
    can_update: Boolean(row.can_update),
    can_delete: Boolean(row.can_delete),
    can_approve: Boolean(row.can_approve),
  };
}

/** Modules the caller may see, with the spec of their published forms. */
export async function modulesForUser(userId: number, roleSlug: string | null, options: { publishedOnly?: boolean } = {}) {
  const columns = `m.id, m.name, m.slug, m.description, m.icon, m.category, m.version, m.module_type,
        m.default_tat_days, m.requires_verification, m.status, m.sort_order,
        (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL
           AND f.status = 'published') AS published_forms`;
  const params: SqlValue[] = [];
  let sql: string;

  if (roleSlug === 'auditor') {
    // Auditors: the forms of their own auditor type, plus anything assigned to them personally.
    sql = `
      SELECT DISTINCT ${columns}
      FROM dynamic_modules m
      WHERE m.deleted_at IS NULL AND (
        EXISTS (SELECT 1 FROM dynamic_module_user_assignments ua WHERE ua.module_id = m.id AND ua.user_id = ?)
        OR EXISTS (SELECT 1 FROM auditor_type_modules atm
                     JOIN auditors a ON a.auditor_type_id = atm.auditor_type_id AND a.user_id = ? AND a.deleted_at IS NULL
                    WHERE atm.module_id = m.id)
      )`;
    params.push(userId, userId);
  } else {
    sql = `
      SELECT DISTINCT ${columns}
      FROM dynamic_modules m
      WHERE m.deleted_at IS NULL AND (
        EXISTS (SELECT 1 FROM dynamic_module_user_assignments ua WHERE ua.module_id = m.id AND ua.user_id = ?)
        ${roleSlug ? `OR EXISTS (SELECT 1 FROM dynamic_module_role_assignments ra JOIN roles r ON r.id = ra.role_id
                                  WHERE ra.module_id = m.id AND r.slug = ?)` : ''}
      )`;
    params.push(userId);
    if (roleSlug) params.push(roleSlug);
  }
  if (options.publishedOnly) sql += " AND m.status = 'published'";
  sql += ' ORDER BY m.sort_order ASC, m.name ASC';
  return query<RowDataPacket>(sql, params);
}

/* ───────────────── auditor type ↔ module mapping ───────────────── */

export async function modulesForAuditorType(auditorTypeId: number) {
  return query<RowDataPacket>(
    `SELECT m.id, m.name, m.module_type, m.category, m.status, atm.sort_order,
            (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL AND f.status = 'published') AS published_forms
       FROM auditor_type_modules atm
       JOIN dynamic_modules m ON m.id = atm.module_id AND m.deleted_at IS NULL
      WHERE atm.auditor_type_id = ?
      ORDER BY atm.sort_order, m.name`,
    [auditorTypeId]
  );
}

/** Replaces the type's module set in one transaction. */
export async function setModulesForAuditorType(auditorTypeId: number, moduleIds: number[], userId: number | null) {
  await withTransaction(async (tx) => {
    await tx.execute('DELETE FROM auditor_type_modules WHERE auditor_type_id = ?', [auditorTypeId]);
    let order = 0;
    for (const moduleId of moduleIds) {
      order += 1;
      await tx.execute(
        'INSERT IGNORE INTO auditor_type_modules (auditor_type_id, module_id, sort_order, created_by) VALUES (?, ?, ?, ?)',
        [auditorTypeId, moduleId, order, userId]
      );
    }
  });
}

/* ─────────────────────────────── forms ─────────────────────────────────── */

export const FORM_SORT_COLUMNS = ['created_at', 'name', 'status', 'version', 'updated_at'];

export async function listForms(filters: Record<string, unknown>): Promise<{ data: FormRow[]; pagination: { total: number; page: number; limit: number; totalPages: number; from: number; to: number } }> {
  const params: SqlValue[] = [];
  let where = ' WHERE f.deleted_at IS NULL';
  where += buildSearch(filters.search as string | undefined, ['f.name', 'f.slug', 'f.description'], params);
  if (filters.module_id) {
    where += ' AND f.module_id = ?';
    params.push(Number(filters.module_id));
  }
  if (filters.status) {
    where += ' AND f.status = ?';
    params.push(String(filters.status));
  }
  if (filters.form_type) {
    where += ' AND f.form_type = ?';
    params.push(String(filters.form_type));
  }

  const baseSql = `SELECT ${FORM_COLUMNS}, m.name AS module_name,
      (SELECT COUNT(*) FROM dynamic_form_sections s WHERE s.form_id = f.id AND s.deleted_at IS NULL) AS section_count,
      (SELECT COUNT(*) FROM dynamic_form_fields fd WHERE fd.form_id = f.id AND fd.deleted_at IS NULL) AS field_count,
      (SELECT COUNT(*) FROM dynamic_tables t WHERE t.form_id = f.id AND t.deleted_at IS NULL) AS table_count,
      (SELECT COUNT(*) FROM dynamic_form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL) AS submission_count
    FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id${where}`;
  const countSql = `SELECT COUNT(*) FROM dynamic_forms f${where}`;

  return paginatedQuery<FormRow>(baseSql, countSql, params, {
    ...(filters as ListQuery),
    allowedSortColumns: FORM_SORT_COLUMNS,
    defaultSort: 'created_at',
  });
}

export async function findFormById(formId: number): Promise<(FormRow & { module_name?: string; module_status?: string }) | null> {
  return queryOne<FormRow & { module_name?: string; module_status?: string }>(
    `SELECT ${FORM_COLUMNS}, m.name AS module_name, m.status AS module_status
     FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id
     WHERE f.id = ? AND f.deleted_at IS NULL`,
    [formId]
  );
}

export async function findFormBySlug(moduleId: number, slug: string, excludeId?: number): Promise<FormRow | null> {
  const params: SqlValue[] = [moduleId, slug];
  let sql = 'SELECT id, name, slug FROM dynamic_forms WHERE module_id = ? AND slug = ? AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  return queryOne<FormRow>(sql, params);
}

export async function formsForModule(moduleId: number, publishedOnly = false): Promise<FormRow[]> {
  const params: SqlValue[] = [moduleId];
  let sql = `SELECT ${FORM_COLUMNS} FROM dynamic_forms f WHERE f.module_id = ? AND f.deleted_at IS NULL`;
  if (publishedOnly) sql += " AND f.status = 'published'";
  sql += ' ORDER BY f.created_at ASC';
  return query<FormRow>(sql, params);
}

export async function createForm(data: Record<string, unknown>): Promise<number> {
  return insert(
    `INSERT INTO dynamic_forms
      (module_id, name, slug, description, form_type, version, layout_columns, requires_signature,
       requires_attachments, allow_draft, auto_number_prefix, status, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.module_id, data.name, data.slug, data.description ?? null, data.form_type ?? 'STANDARD',
      data.version ?? 1, data.layout_columns ?? 1, data.requires_signature ? 1 : 0,
      data.requires_attachments ? 1 : 0, data.allow_draft === false ? 0 : 1,
      data.auto_number_prefix ?? null, data.status ?? 'draft', data.user_id ?? null, data.user_id ?? null,
    ]
  );
}

export async function updateForm(formId: number, data: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE dynamic_forms SET name = ?, slug = ?, description = ?, form_type = ?, layout_columns = ?,
        requires_signature = ?, requires_attachments = ?, allow_draft = ?, auto_number_prefix = ?,
        status = ?, updated_by = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      data.name, data.slug, data.description ?? null, data.form_type ?? 'STANDARD', data.layout_columns ?? 1,
      data.requires_signature ? 1 : 0, data.requires_attachments ? 1 : 0, data.allow_draft === false ? 0 : 1,
      data.auto_number_prefix ?? null, data.status ?? 'draft', data.user_id ?? null, formId,
    ]
  );
}

export async function setFormStatus(formId: number, status: string, version: number | null, userId: number | null): Promise<void> {
  if (version === null) {
    await query('UPDATE dynamic_forms SET status = ?, updated_by = ? WHERE id = ?', [status, userId, formId]);
    return;
  }
  await query('UPDATE dynamic_forms SET status = ?, version = ?, updated_by = ? WHERE id = ?', [status, version, userId, formId]);
}

export async function softDeleteForm(formId: number): Promise<void> {
  await query('UPDATE dynamic_forms SET deleted_at = NOW() WHERE id = ?', [formId]);
}

export async function formUsage(formId: number): Promise<number> {
  return Number((await queryScalar<number>('SELECT COUNT(*) FROM dynamic_form_submissions WHERE form_id = ? AND deleted_at IS NULL', [formId])) ?? 0);
}

/* ─────────────────────────── form structure ────────────────────────────── */

export interface StructureBundle {
  sections: (SectionRow & { fields: (FieldRow & { options: OptionRow[] })[]; tables: (TableRow & { columns: ColumnRow[] })[] })[];
  fields: (FieldRow & { options: OptionRow[] })[];
  tables: (TableRow & { columns: ColumnRow[] })[];
}

/** One read that returns the whole form, ordered exactly as the builder arranged it. */
export async function getStructure(formId: number): Promise<StructureBundle> {
  const [sections, fields, options, tables, columns] = await Promise.all([
    query<SectionRow>('SELECT * FROM dynamic_form_sections WHERE form_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC', [formId]),
    query<FieldRow>('SELECT * FROM dynamic_form_fields WHERE form_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC', [formId]),
    query<OptionRow>(
      `SELECT o.* FROM dynamic_field_options o
       JOIN dynamic_form_fields f ON f.id = o.field_id
       WHERE f.form_id = ? AND f.deleted_at IS NULL AND o.status = 'active'
       ORDER BY o.sort_order ASC, o.id ASC`,
      [formId]
    ),
    query<TableRow>('SELECT * FROM dynamic_tables WHERE form_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC', [formId]),
    query<ColumnRow>(
      `SELECT c.* FROM dynamic_table_columns c
       JOIN dynamic_tables t ON t.id = c.table_id
       WHERE t.form_id = ? AND t.deleted_at IS NULL AND c.status = 'active'
       ORDER BY c.sort_order ASC, c.id ASC`,
      [formId]
    ),
  ]);

  const optionsByField = new Map<number, OptionRow[]>();
  for (const option of options) {
    const list = optionsByField.get(Number(option.field_id)) ?? [];
    list.push(option);
    optionsByField.set(Number(option.field_id), list);
  }
  const columnsByTable = new Map<number, ColumnRow[]>();
  for (const column of columns) {
    const list = columnsByTable.get(Number(column.table_id)) ?? [];
    list.push(column);
    columnsByTable.set(Number(column.table_id), list);
  }

  const fieldsWithOptions = fields.map((field) => ({ ...field, options: optionsByField.get(Number(field.id)) ?? [] }));
  const tablesWithColumns = tables.map((table) => ({ ...table, columns: columnsByTable.get(Number(table.id)) ?? [] }));

  return {
    sections: sections.map((section) => ({
      ...section,
      fields: fieldsWithOptions.filter((field) => Number(field.section_id) === Number(section.id)),
      tables: tablesWithColumns.filter((table) => Number(table.section_id) === Number(section.id)),
    })),
    fields: fieldsWithOptions,
    tables: tablesWithColumns,
  };
}

/** The builder's save payload — the same contract the API validates, imported so a
 * change in the schema can never silently drift from what the repository writes. */
type StructurePayload = FormStructurePayload;

/**
 * Replaces a form's structure. Everything runs in one transaction: sections and
 * tables are written first (fields and columns need their ids), then the rows
 * that vanished from the payload are soft-deleted.
 */
export async function replaceStructure(formId: number, payload: StructurePayload, userId: number | null): Promise<void> {
  await transaction(async (conn) => {
    const keepSections: number[] = [];
    const keepFields: number[] = [];
    const keepTables: number[] = [];
    const keepColumns: number[] = [];

    for (const section of payload.sections) {
      let sectionId = section.id ? Number(section.id) : 0;
      const sectionValues = [
        section.title, section.section_code ?? null, section.description ?? null, section.layout_columns ?? 1,
        section.is_repeatable ? 1 : 0, section.is_collapsible ? 1 : 0, section.is_collapsed ? 1 : 0,
        section.show_in_pdf === false ? 0 : 1, section.page_break_before ? 1 : 0,
        section.sort_order ?? 0, section.status ?? 'active',
      ];
      if (sectionId) {
        await conn.query(
          `UPDATE dynamic_form_sections SET title = ?, section_code = ?, description = ?, layout_columns = ?,
              is_repeatable = ?, is_collapsible = ?, is_collapsed = ?, show_in_pdf = ?, page_break_before = ?,
              sort_order = ?, status = ?, deleted_at = NULL
           WHERE id = ? AND form_id = ?`,
          [...sectionValues, sectionId, formId]
        );
      } else {
        const [result] = await conn.query<RowDataPacket[]>(
          `INSERT INTO dynamic_form_sections
            (form_id, title, section_code, description, layout_columns, is_repeatable, is_collapsible, is_collapsed,
             show_in_pdf, page_break_before, sort_order, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [formId, ...sectionValues, userId]
        );
        sectionId = Number((result as unknown as { insertId: number }).insertId);
      }
      keepSections.push(sectionId);

      for (const table of section.tables ?? []) {
        let tableId = table.id ? Number(table.id) : 0;
        const tableValues = [
          sectionId, table.table_key, table.table_name, table.table_name_ta ?? null, table.description ?? null,
          table.is_repeatable === false ? 0 : 1, table.min_rows ?? 0, table.max_rows ?? null,
          table.show_row_numbers === false ? 0 : 1, table.show_totals ? 1 : 0,
          table.show_in_pdf === false ? 0 : 1, table.sort_order ?? 0, table.status ?? 'active',
        ];
        if (tableId) {
          await conn.query(
            `UPDATE dynamic_tables SET section_id = ?, table_key = ?, table_name = ?, table_name_ta = ?, description = ?,
                is_repeatable = ?, min_rows = ?, max_rows = ?, show_row_numbers = ?, show_totals = ?, show_in_pdf = ?,
                sort_order = ?, status = ?, deleted_at = NULL
             WHERE id = ? AND form_id = ?`,
            [...tableValues, tableId, formId]
          );
        } else {
          const [result] = await conn.query<RowDataPacket[]>(
            `INSERT INTO dynamic_tables
              (form_id, section_id, table_key, table_name, table_name_ta, description, is_repeatable, min_rows,
               max_rows, show_row_numbers, show_totals, show_in_pdf, sort_order, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [formId, ...tableValues, userId]
          );
          tableId = Number((result as unknown as { insertId: number }).insertId);
        }
        keepTables.push(tableId);

        for (const column of table.columns) {
          const columnValues = [
            column.column_key, column.column_label, column.column_label_ta ?? null, column.column_type,
            column.options_json ? JSON.stringify(column.options_json) : null, column.formula_expression ?? null,
            column.default_value ?? null, column.width_pct ?? null, column.is_required ? 1 : 0,
            column.is_editable === false ? 0 : 1, column.is_sortable ? 1 : 0, column.is_total ? 1 : 0,
            column.show_in_pdf === false ? 0 : 1, column.validation_json ? JSON.stringify(column.validation_json) : null,
            column.sort_order ?? 0, column.status ?? 'active',
          ];
          let columnId = column.id ? Number(column.id) : 0;
          if (columnId) {
            await conn.query(
              `UPDATE dynamic_table_columns SET column_key = ?, column_label = ?, column_label_ta = ?, column_type = ?,
                  options_json = ?, formula_expression = ?, default_value = ?, width_pct = ?, is_required = ?,
                  is_editable = ?, is_sortable = ?, is_total = ?, show_in_pdf = ?, validation_json = ?,
                  sort_order = ?, status = ?, deleted_at = NULL
               WHERE id = ? AND table_id = ?`,
              [...columnValues, columnId, tableId]
            );
          } else {
            const [result] = await conn.query<RowDataPacket[]>(
              `INSERT INTO dynamic_table_columns
                (table_id, column_key, column_label, column_label_ta, column_type, options_json, formula_expression,
                 default_value, width_pct, is_required, is_editable, is_sortable, is_total, show_in_pdf,
                 validation_json, sort_order, status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [tableId, ...columnValues, userId]
            );
            columnId = Number((result as unknown as { insertId: number }).insertId);
          }
          keepColumns.push(columnId);
        }
      }

      for (const field of section.fields ?? []) {
        const fieldValues = [
          sectionId, field.field_key, field.label, field.label_ta ?? null, field.field_type,
          field.placeholder ?? null, field.help_text ?? null, field.default_value ?? null,
          field.validation_json ? JSON.stringify(field.validation_json) : null,
          field.conditional_json ? JSON.stringify(field.conditional_json) : null,
          field.table_definition_id ?? null, field.formula_expression ?? null,
          field.is_required ? 1 : 0, field.is_readonly ? 1 : 0, field.is_unique ? 1 : 0,
          field.show_in_pdf === false ? 0 : 1, field.show_in_list ? 1 : 0, field.column_width ?? 12,
          field.min_value ?? null, field.max_value ?? null, field.min_length ?? null, field.max_length ?? null,
          field.regex_pattern ?? null, field.sort_order ?? 0, field.status ?? 'active',
        ];
        let fieldId = field.id ? Number(field.id) : 0;
        if (fieldId) {
          await conn.query(
            `UPDATE dynamic_form_fields SET section_id = ?, field_key = ?, label = ?, label_ta = ?, field_type = ?,
                placeholder = ?, help_text = ?, default_value = ?, validation_json = ?, conditional_json = ?,
                table_definition_id = ?, formula_expression = ?, is_required = ?, is_readonly = ?, is_unique = ?,
                show_in_pdf = ?, show_in_list = ?, column_width = ?, min_value = ?, max_value = ?, min_length = ?,
                max_length = ?, regex_pattern = ?, sort_order = ?, status = ?, deleted_at = NULL
             WHERE id = ? AND form_id = ?`,
            [...fieldValues, fieldId, formId]
          );
        } else {
          const [result] = await conn.query<RowDataPacket[]>(
            `INSERT INTO dynamic_form_fields
              (form_id, section_id, field_key, label, label_ta, field_type, placeholder, help_text, default_value,
               validation_json, conditional_json, table_definition_id, formula_expression, is_required, is_readonly,
               is_unique, show_in_pdf, show_in_list, column_width, min_value, max_value, min_length, max_length,
               regex_pattern, sort_order, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [formId, ...fieldValues, userId]
          );
          fieldId = Number((result as unknown as { insertId: number }).insertId);
        }
        keepFields.push(fieldId);

        await conn.query('DELETE FROM dynamic_field_options WHERE field_id = ?', [fieldId]);
        for (const option of field.options ?? []) {
          await conn.query(
            `INSERT INTO dynamic_field_options
              (field_id, option_key, option_label, option_label_ta, option_value, color, score, is_default, sort_order, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [fieldId, option.option_key, option.option_label,
              option.option_label_ta ?? null, option.option_value ?? null, option.color ?? null,
              option.score ?? null, option.is_default ? 1 : 0, option.sort_order ?? 0]
          );
        }
      }
    }

    // Rows the builder removed: soft-delete, so historic submissions keep their labels.
    await softDeleteMissing(conn, 'dynamic_form_fields', 'form_id', formId, keepFields);
    await softDeleteMissing(conn, 'dynamic_form_sections', 'form_id', formId, keepSections);
    await softDeleteMissing(conn, 'dynamic_table_columns', 'table_id', null, keepColumns, 'dynamic_tables', formId);
    await softDeleteMissing(conn, 'dynamic_tables', 'form_id', formId, keepTables);
  });
}

async function softDeleteMissing(
  conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  table: string,
  keyColumn: string,
  keyValue: number | null,
  keepIds: number[],
  parentTable?: string,
  parentValue?: number
): Promise<void> {
  const placeholders = keepIds.length ? keepIds.map(() => '?').join(', ') : '0';
  if (parentTable) {
    await conn.query(
      `UPDATE ${table} SET deleted_at = NOW()
       WHERE ${keyColumn} IN (SELECT id FROM ${parentTable} WHERE id = ?)
         AND id NOT IN (${placeholders}) AND deleted_at IS NULL`,
      [parentValue, ...keepIds]
    );
    return;
  }
  await conn.query(
    `UPDATE ${table} SET deleted_at = NOW()
     WHERE ${keyColumn} = ? AND id NOT IN (${placeholders}) AND deleted_at IS NULL`,
    [keyValue, ...keepIds]
  );
}

/* ────────────────────────── submission counters ────────────────────────── */

export async function formSubmissionCounts(formId: number): Promise<{ total: number; drafts: number; submitted: number; approved: number }> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'draft') AS drafts,
       SUM(status IN ('submitted','under_review','changes_requested')) AS submitted,
       SUM(status = 'approved') AS approved
     FROM dynamic_form_submissions WHERE form_id = ? AND deleted_at IS NULL`,
    [formId]
  );
  return {
    total: Number(row?.total ?? 0),
    drafts: Number(row?.drafts ?? 0),
    submitted: Number(row?.submitted ?? 0),
    approved: Number(row?.approved ?? 0),
  };
}

/** Distinct field keys already stored for a form — used to validate unique fields. */
export async function fieldKeysFor(formId: number): Promise<{ id: number; field_key: string; label: string; is_unique: boolean; field_type: string }[]> {
  const rows = await query<RowDataPacket>(
    `SELECT id, field_key, label, is_unique, field_type FROM dynamic_form_fields
     WHERE form_id = ? AND deleted_at IS NULL AND status = 'active'
       AND field_type NOT IN ('heading','paragraph','divider')`,
    [formId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    field_key: String(row.field_key),
    label: String(row.label),
    is_unique: Boolean(row.is_unique),
    field_type: String(row.field_type),
  }));
}

export function structureToPayload(bundle: StructureBundle) {
  return {
    sections: bundle.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field, validation_json: parseJson(field.validation_json, null), conditional_json: parseJson(field.conditional_json, null), options: field.options })),
      tables: section.tables.map((table) => ({
        ...table,
        columns: table.columns.map((column) => ({ ...column, options_json: parseJson(column.options_json, null), validation_json: parseJson(column.validation_json, null) })),
      })),
    })),
    fields: bundle.fields.map((field) => ({ ...field, validation_json: parseJson(field.validation_json, null), conditional_json: parseJson(field.conditional_json, null) })),
    tables: bundle.tables.map((table) => ({ ...table, columns: table.columns.map((column) => ({ ...column, options_json: parseJson(column.options_json, null), validation_json: parseJson(column.validation_json, null) })) })),
  };
}
