/**
 * Dynamic module engine — the builder side.
 *
 * Everything an administrator does in `/admin/dynamic-modules` goes through this
 * service: creating a module, laying out its forms (sections → fields → options,
 * tables → columns), publishing them to the panel that fills them in, and
 * deciding which roles or individual users may use the module.
 *
 * Two invariants are enforced here rather than in the UI:
 *   1. **a published form must be answerable** — it needs sections, fields, unique
 *      keys, resolvable conditional logic and valid formulas; publishing runs the
 *      same checks the renderer runs (`assertPublishable`);
 *   2. **history is never destroyed** — deleting a module or form that has
 *      submissions is refused with a 409 (`IN_USE`), and the structure save
 *      soft-deletes removed rows so historic submissions keep their labels.
 */
import { ZodError, type ZodIssue } from 'zod';
import { query, queryOne, queryScalar, type RowDataPacket } from '@/lib/db/mysql';
import { slugify } from '@/lib/utils/formatting';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { compileFormula, formulaIdentifiers, FORMULA_FUNCTIONS } from '@/lib/utils/formula';
import * as repo from '@/repositories/dynamic-module.repository';
import {
  assignmentPayloadSchema, cloneSchema, formListQuerySchema, formStructureSchema, moduleListQuerySchema,
  modulePayloadSchema, LAYOUT_FIELD_TYPES,
  type AssignmentPayload, type FormStructurePayload,
} from '@/lib/validations/dynamic-module.validation';
import { DECORATIVE_TYPES, evaluateConditions, fieldOptions, type FormStructure, type StructureField } from '@/services/dynamic-form-rules';

/**
 * Query strings reach services either as the URLSearchParams from
 * `parseSearchParams` or as a plain object (tests, internal calls). Both are
 * normalised here so every list endpoint behaves the same.
 */
export function filterObject(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof URLSearchParams !== 'undefined' && input instanceof URLSearchParams) {
    return Object.fromEntries(input.entries());
  }
  return input as Record<string, unknown>;
}

export interface ServiceActor {
  id: number;
  name?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/* ─────────────────────────── error helpers ─────────────────────────────── */

type ServiceError = Error & { code: string };

const forbidden = (message: string): ServiceError => Object.assign(new Error(message), { code: 'FORBIDDEN' });
const notFoundError = (resource: string): ServiceError => Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const conflict = (code: string, message: string): ServiceError => Object.assign(new Error(message), { code });

/** Field-level 422s: a ZodError is what `handleRouteError` turns into `errors[]`. */
const validationError = (issues: { field: string; message: string }[]): ZodError =>
  new ZodError(issues.map((issue) => ({ code: 'custom', path: [issue.field], message: issue.message } as ZodIssue)));

/* ─────────────────────────────── modules ───────────────────────────────── */

export async function listModules(rawFilters: unknown) {
  const filters = moduleListQuerySchema.parse(filterObject(rawFilters));
  const result = await repo.listModules(filters);
  const [stats, options] = await Promise.all([repo.moduleStats(), repo.moduleOptions()]);
  return { ...result, stats, moduleOptions: options };
}

export async function moduleRegister() {
  const [rows, stats] = await Promise.all([
    repo.listModules({ page: 1, limit: 200, sortBy: 'sort_order', sortDir: 'asc' }),
    repo.moduleStats(),
  ]);
  return { rows: rows.data, stats };
}

export async function moduleOptions() {
  const [modules, categories] = await Promise.all([
    repo.moduleOptions(),
    query<RowDataPacket>(
      `SELECT DISTINCT category FROM dynamic_modules
       WHERE deleted_at IS NULL AND category IS NOT NULL AND category <> '' ORDER BY category ASC`
    ),
  ]);
  return {
    modules,
    categories: categories.map((row) => String(row.category)),
    moduleTypes: ['AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'WORK_PERMIT', 'INSPECTION', 'CUSTOM'],
    statuses: ['draft', 'published', 'archived'],
    formTypes: ['STANDARD', 'AUDIT', 'CHECKLIST', 'INSPECTION', 'PERMIT', 'ASSESSMENT'],
    roles: await roleLookup(),
  };
}

async function roleLookup() {
  const rows = await query<RowDataPacket>('SELECT slug, name FROM roles ORDER BY name ASC');
  return rows.map((row) => ({ value: String(row.slug), label: String(row.name) }));
}

/** Roles a dynamic module can be granted to, for the assignment matrix. */
export async function roleOptions() {
  return roleLookup();
}

/**
 * Users who can be granted a module directly, skipping the role-wide grant —
 * auditors in particular, plus the panels that consume submitted forms.
 */
export async function assignableUsers() {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
        (SELECT r.slug FROM user_roles ur2 JOIN roles r ON r.id = ur2.role_id WHERE ur2.user_id = u.id LIMIT 1) AS role_slug
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.deleted_at IS NULL AND u.status = 'active'
       AND r.slug IN ('auditor', 'verifier', 'admin', 'super_admin', 'employer', 'employee')
     ORDER BY u.first_name ASC, u.last_name ASC`
  );
  return rows.map((row) => ({
    value: String(row.id),
    label: `${String(row.first_name)} ${String(row.last_name ?? '')}`.trim(),
    hint: `${String(row.email)}${row.role_slug ? ` · ${String(row.role_slug)}` : ''}`,
  }));
}

export async function getModuleDetail(moduleId: number) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  const [forms, roleAssignments, userAssignments] = await Promise.all([
    repo.formsForModule(moduleId),
    repo.roleAssignmentsFor(moduleId),
    repo.userAssignmentsFor(moduleId),
  ]);
  const counts = await Promise.all(forms.map((form) => repo.formSubmissionCounts(Number(form.id))));
  return {
    module,
    forms: forms.map((form, index) => ({
      ...form,
      submission_count: counts[index].total,
      submitted_count: counts[index].submitted,
      approved_count: counts[index].approved,
      draft_count: counts[index].drafts,
    })),
    roleAssignments,
    userAssignments,
    stats: {
      forms: forms.length,
      published: forms.filter((form) => form.status === 'published').length,
      submissions: counts.reduce((sum, c) => sum + c.total, 0),
      awaitingReview: counts.reduce((sum, c) => sum + c.submitted, 0),
      fields: Number((await queryScalar<number>(
        `SELECT COUNT(*) FROM dynamic_form_fields f JOIN dynamic_forms fm ON fm.id = f.form_id
         WHERE fm.module_id = ? AND f.deleted_at IS NULL AND fm.deleted_at IS NULL`,
        [moduleId]
      )) ?? 0),
    },
  };
}

export async function createModule(payload: unknown, actor: ServiceActor) {
  const input = modulePayloadSchema.parse(payload);
  const slug = await uniqueModuleSlug(input.slug ?? slugify(input.name));

  const moduleId = await repo.createModule({
    ...input,
    slug,
    user_id: actor.id,
  });

  let formId: number | null = null;
  if (input.create_default_form) {
    formId = await repo.createForm({
      module_id: moduleId,
      name: `${input.name} — Standard Form`,
      slug: 'standard-form',
      description: null,
      form_type: input.module_type === 'AUDIT' ? 'AUDIT' : 'STANDARD',
      version: 1,
      layout_columns: 1,
      requires_signature: false,
      requires_attachments: false,
      allow_draft: true,
      auto_number_prefix: null,
      status: 'draft',
      user_id: actor.id,
    });
  }

  if (input.roles.length > 0) {
    await assignModule(moduleId, { roles: input.roles.map((role) => ({
      role, can_create: true, can_read: true, can_update: true, can_delete: false, can_approve: false,
    })), users: [] }, actor);
  }

  await log(actor, 'created', moduleId, `Dynamic module ${input.name} created`, { name: input.name, module_type: input.module_type });

  return { moduleId, slug, formId };
}

export async function updateModule(moduleId: number, payload: unknown, actor: ServiceActor) {
  const existing = await repo.findModuleById(moduleId);
  if (!existing) throw notFoundError('Module');
  const input = modulePayloadSchema.parse(payload);
  const slug = input.slug && input.slug !== existing.slug
    ? await uniqueModuleSlug(input.slug ?? slugify(input.name), moduleId)
    : existing.slug;

  await repo.updateModule(moduleId, { ...input, slug, user_id: actor.id });

  const changes: Record<string, [unknown, unknown]> = {};
  if (existing.name !== input.name) changes.name = [existing.name, input.name];
  if (existing.status !== input.status) changes.status = [existing.status, input.status];
  if (existing.module_type !== input.module_type) changes.module_type = [existing.module_type, input.module_type];

  await log(actor, 'updated', moduleId, `Dynamic module ${input.name} updated`, changes);
  return { moduleId, slug, changes };
}

async function uniqueModuleSlug(base: string, excludeId?: number): Promise<string> {
  let candidate = base || 'module';
  let suffix = 1;
  for (;;) {
    const clash = await repo.findModuleBySlug(candidate, excludeId);
    if (!clash) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/** Publishing checks that the module actually has something to hand out. */
/**
 * Publishes the module and, with it, every form inside that is structurally
 * ready. A form that is still incomplete (empty section, no answerable field,
 * missing options, broken formula) is left as a draft and reported back in
 * `skipped`, so one unfinished form can never block the whole module — and the
 * administrator is told exactly which form still needs work.
 */
export async function publishModule(moduleId: number, actor: ServiceActor) {
  const detail = await getModuleDetail(moduleId);
  const publishable = detail.forms.filter((form) => form.status !== 'archived');
  if (publishable.length === 0) {
    throw conflict('INVALID_STATE', 'Add at least one form before publishing the module');
  }

  const draftForms = publishable.filter((form) => form.status === 'draft');
  const published: number[] = [];
  const skipped: { formId: number; name: string; reason: string }[] = [];
  for (const form of draftForms) {
    try {
      await publishForm(Number(form.id), actor);
      published.push(Number(form.id));
    } catch (error) {
      const raised = error as Error & { issues?: { message: string }[] };
      skipped.push({
        formId: Number(form.id),
        name: String(form.name),
        reason: raised.issues?.[0]?.message ?? raised.message,
      });
    }
  }

  const liveForms = publishable.filter((form) => form.status === 'published').length + published.length;
  if (liveForms === 0) {
    throw validationError(skipped.map((entry) => ({ field: `form.${entry.formId}`, message: `${entry.name}: ${entry.reason}` })));
  }

  const version = nextVersion(detail.module.version);
  await repo.setModuleStatus(moduleId, 'published', actor.id);
  await repo.touchModuleVersion(moduleId, version, actor.id);
  await log(actor, 'published', moduleId, `Dynamic module ${detail.module.name} published as v${version}`, {
    version, forms: publishable.length, publishedForms: published.length, skipped: skipped.map((entry) => entry.formId),
  });
  return {
    moduleId,
    version,
    forms: publishable.length,
    /** Forms pushed live by this call. */
    publishedForms: published.length,
    /** Forms live in the module after this call (already-published ones included). */
    liveForms,
    skipped,
  };
}

export async function archiveModule(moduleId: number, actor: ServiceActor) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  await repo.setModuleStatus(moduleId, 'archived', actor.id);
  await log(actor, 'archived', moduleId, `Dynamic module ${module.name} archived`, null);
  return { moduleId, status: 'archived' };
}

export async function deleteModule(moduleId: number, actor: ServiceActor) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  const usage = await repo.moduleUsage(moduleId);
  if (usage.submissions > 0) {
    throw conflict('IN_USE', `This module has ${usage.submissions} submission(s) and cannot be deleted — archive it instead`);
  }
  await repo.softDeleteModule(moduleId);
  await log(actor, 'deleted', moduleId, `Dynamic module ${module.name} deleted`, { forms: usage.forms });
  return { moduleId, deleted: true, formsRemoved: usage.forms };
}

export async function cloneModule(moduleId: number, payload: unknown, actor: ServiceActor) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  const input = cloneSchema.parse(payload);
  const slug = await uniqueModuleSlug(input.slug ?? slugify(input.name));

  const newModuleId = await repo.createModule({
    name: input.name,
    slug,
    description: module.description,
    icon: module.icon,
    category: module.category,
    version: module.version,
    module_type: module.module_type,
    default_tat_days: module.default_tat_days,
    requires_verification: module.requires_verification,
    is_public: module.is_public,
    sort_order: module.sort_order,
    status: 'draft',
    user_id: actor.id,
  });

  const clonedForms: number[] = [];
  if (input.copy_forms) {
    const forms = await repo.formsForModule(moduleId);
    for (const form of forms) {
      const bundle = await repo.getStructure(Number(form.id));
      const newFormId = await repo.createForm({
        module_id: newModuleId,
        name: form.name,
        slug: form.slug,
        description: form.description,
        form_type: form.form_type,
        version: 1,
        layout_columns: form.layout_columns,
        requires_signature: form.requires_signature,
        requires_attachments: form.requires_attachments,
        allow_draft: form.allow_draft,
        auto_number_prefix: form.auto_number_prefix,
        status: 'draft',
        user_id: actor.id,
      });
      await repo.replaceStructure(newFormId, structurePayloadFromBundle(bundle), actor.id);
      clonedForms.push(newFormId);
    }
  }

  if (input.copy_assignments) {
    const roles = await repo.roleAssignmentsFor(moduleId);
    if (roles.length) {
      await repo.replaceRoleAssignments(newModuleId, roles.map((row) => ({
        role: row.role_slug,
        can_create: Boolean(row.can_create),
        can_read: Boolean(row.can_read),
        can_update: Boolean(row.can_update),
        can_delete: Boolean(row.can_delete),
        can_approve: Boolean(row.can_approve),
      })), actor.id);
    }
    const users = await repo.userAssignmentsFor(moduleId);
    if (users.length) {
      await repo.replaceUserAssignments(newModuleId, users.map((row) => ({ user_id: Number(row.user_id), auditor_id: row.auditor_id })), actor.id);
    }
  }

  await log(actor, 'created', newModuleId, `Dynamic module ${module.name} cloned as ${input.name}`, { sourceModuleId: moduleId, forms: clonedForms.length });
  return { moduleId: newModuleId, slug, forms: clonedForms };
}

/** Roles chosen here are the ones that may open the module; users are named individually. */
export async function assignModule(moduleId: number, payload: unknown, actor: ServiceActor) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  const input: AssignmentPayload = assignmentPayloadSchema.parse(payload);

  const knownRoles = new Set((await roleLookup()).map((role) => role.value));
  const unknownRoles = input.roles.map((row) => row.role).filter((role) => !knownRoles.has(role));
  if (unknownRoles.length) throw validationError([{ field: 'roles', message: `Unknown role(s): ${unknownRoles.join(', ')}` }]);

  await repo.replaceRoleAssignments(moduleId, input.roles, actor.id);

  if (input.users.length) {
    const userIds = input.users.map((row) => row.user_id);
    const placeholders = userIds.map(() => '?').join(', ');
    const found = await query<RowDataPacket>(`SELECT id FROM users WHERE id IN (${placeholders}) AND deleted_at IS NULL`, userIds);
    const foundIds = new Set(found.map((row) => Number(row.id)));
    const missing = userIds.filter((id) => !foundIds.has(id));
    if (missing.length) throw validationError([{ field: 'users', message: `Unknown user(s): ${missing.join(', ')}` }]);
  }
  await repo.replaceUserAssignments(moduleId, input.users, actor.id);

  await log(actor, 'updated', moduleId, `Module ${module.name} access updated`, {
    roles: input.roles.map((row) => row.role),
    users: input.users.length,
  });
  return {
    moduleId,
    roles: input.roles.map((row) => row.role),
    users: input.users.length,
  };
}

/* ──────────────────────────────── forms ────────────────────────────────── */

export async function listForms(rawFilters: unknown) {
  const filters = formListQuerySchema.parse(filterObject(rawFilters));
  const result = await repo.listForms(filters);
  const [modules, roleOptions] = await Promise.all([repo.moduleOptions(), roleLookup()]);
  return { ...result, moduleOptions: modules, formTypes: ['STANDARD', 'AUDIT', 'CHECKLIST', 'INSPECTION', 'PERMIT', 'ASSESSMENT'], roles: roleOptions };
}

export async function createForm(moduleId: number, payload: unknown, actor: ServiceActor) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  const parsed = formStructureSchema.parse(payload);
  assertStructureParses(parsed);
  const slug = await uniqueFormSlug(moduleId, parsed.slug ?? slugify(parsed.name));
  const formId = await repo.createForm({ ...parsed, module_id: moduleId, slug, version: 1, user_id: actor.id });
  await repo.replaceStructure(formId, parsed, actor.id);
  await log(actor, 'created', formId, `Form ${parsed.name} created`, { moduleId, sections: parsed.sections.length });
  return { formId, slug, sectionCount: parsed.sections.length };
}

export async function getFormDetail(formId: number) {
  const form = await repo.findFormById(formId);
  if (!form) throw notFoundError('Form');
  const [bundle, counts] = await Promise.all([repo.getStructure(formId), repo.formSubmissionCounts(formId)]);
  return {
    form,
    structure: serializeStructure(bundle),
    counts,
    canPublish: (() => {
      try {
        assertPublishable(form, bundle);
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

export async function updateForm(formId: number, payload: unknown, actor: ServiceActor) {
  const form = await repo.findFormById(formId);
  if (!form) throw notFoundError('Form');
  const parsed = formStructureSchema.parse(payload);
  assertStructureParses(parsed);

  const slug = parsed.slug && parsed.slug !== form.slug
    ? await uniqueFormSlug(Number(form.module_id), parsed.slug, formId)
    : form.slug;

  await repo.updateForm(formId, { ...parsed, slug, user_id: actor.id });
  await repo.replaceStructure(formId, parsed, actor.id);
  const bundle = await repo.getStructure(formId);

  await log(actor, 'updated', formId, `Form ${parsed.name} saved`, {
    sections: bundle.sections.length,
    fields: bundle.fields.length,
    tables: bundle.tables.length,
  });

  return {
    formId,
    slug,
    sections: bundle.sections.length,
    fields: bundle.fields.length,
    tables: bundle.tables.length,
    structure: serializeStructure(bundle),
  };
}

async function uniqueFormSlug(moduleId: number, base: string, excludeId?: number): Promise<string> {
  let candidate = base || 'form';
  let suffix = 1;
  for (;;) {
    const clash = await repo.findFormBySlug(moduleId, candidate, excludeId);
    if (!clash) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

export async function publishForm(formId: number, actor: ServiceActor) {
  const form = await repo.findFormById(formId);
  if (!form) throw notFoundError('Form');
  const bundle = await repo.getStructure(formId);
  assertPublishable(form, bundle);

  const version = Number(form.version) + 1;
  await repo.setFormStatus(formId, 'published', version, actor.id);
  await log(actor, 'published', formId, `Form ${form.name} published as v${version}`, {
    version, fields: bundle.fields.length, tables: bundle.tables.length,
  });
  return { formId, version, fields: bundle.fields.length, sections: bundle.sections.length, tables: bundle.tables.length };
}

export async function cloneForm(formId: number, payload: unknown, actor: ServiceActor) {
  const form = await repo.findFormById(formId);
  if (!form) throw notFoundError('Form');
  const input = cloneSchema.parse(payload);
  const bundle = await repo.getStructure(formId);
  const slug = await uniqueFormSlug(Number(form.module_id), input.slug ?? slugify(input.name));
  const newFormId = await repo.createForm({
    module_id: form.module_id,
    name: input.name,
    slug,
    description: form.description,
    form_type: form.form_type,
    version: 1,
    layout_columns: form.layout_columns,
    requires_signature: form.requires_signature,
    requires_attachments: form.requires_attachments,
    allow_draft: form.allow_draft,
    auto_number_prefix: form.auto_number_prefix,
    status: 'draft',
    user_id: actor.id,
  });
  await repo.replaceStructure(newFormId, structurePayloadFromBundle(bundle), actor.id);
  await log(actor, 'created', newFormId, `Form ${form.name} cloned as ${input.name}`, { sourceFormId: formId });
  return { formId: newFormId, slug };
}

export async function deleteForm(formId: number, actor: ServiceActor) {
  const form = await repo.findFormById(formId);
  if (!form) throw notFoundError('Form');
  const usage = await repo.formUsage(formId);
  if (usage > 0) {
    throw conflict('IN_USE', `This form has ${usage} submission(s) and cannot be deleted — archive it instead`);
  }
  await repo.setFormStatus(formId, 'archived', null, actor.id);
  await repo.softDeleteForm(formId);
  await log(actor, 'deleted', formId, `Form ${form.name} deleted`, null);
  return { formId, deleted: true };
}

/* ───────────────────────────── publish guard ───────────────────────────── */

/**
 * Everything a form needs before it can be handed to a user. Called by publish
 * (hard failure) and by the detail endpoint (soft, to show the admin what is
 * still missing).
 */
export function assertPublishable(
  form: { id: number | string; name: string; requires_signature?: boolean | number; requires_attachments?: boolean | number },
  bundle: repo.StructureBundle
): void {
  const issues: { field: string; message: string }[] = [];
  const sections = bundle.sections.filter((section) => section.status !== 'inactive');
  if (sections.length === 0) issues.push({ field: 'sections', message: 'Add at least one section' });

  const answerable = bundle.fields.filter((field) => field.status !== 'inactive' && !LAYOUT_FIELD_TYPES.includes(String(field.field_type)));
  if (answerable.length === 0) issues.push({ field: 'fields', message: 'Add at least one field the user can answer' });

  const keys = new Set<string>();
  for (const field of bundle.fields) {
    if (field.status === 'inactive') continue;
    if (keys.has(String(field.field_key))) {
      issues.push({ field: String(field.field_key), message: `Duplicate field key "${field.field_key}"` });
    }
    keys.add(String(field.field_key));
    if (['select', 'radio', 'multi_select'].includes(String(field.field_type)) && fieldOptions(field as unknown as StructureField).length === 0) {
      issues.push({ field: String(field.field_key), message: `${field.label} is a ${field.field_type} with no options` });
    }
    if (String(field.field_type) === 'formula') {
      const expression = field.formula_expression ?? '';
      if (!expression) issues.push({ field: String(field.field_key), message: `${field.label} has no formula` });
      else {
        try {
          compileFormula(expression);
        } catch (error) {
          issues.push({ field: String(field.field_key), message: `${field.label}: ${(error as Error).message}` });
        }
      }
    }
    if (String(field.field_type) === 'table' && !field.table_definition_id) {
      issues.push({ field: String(field.field_key), message: `${field.label} is not linked to a table` });
    }
  }
  for (const dynamicTable of bundle.tables) {
    if (keys.has(String(dynamicTable.table_key))) {
      issues.push({ field: String(dynamicTable.table_key), message: `Duplicate key "${dynamicTable.table_key}"` });
    }
    keys.add(String(dynamicTable.table_key));
    if (dynamicTable.columns.length === 0) {
      issues.push({ field: String(dynamicTable.table_key), message: `${dynamicTable.table_name} has no columns` });
    }
    for (const column of dynamicTable.columns) {
      if (String(column.column_type) === 'formula') {
        const expression = column.formula_expression ?? '';
        if (!expression) issues.push({ field: `${dynamicTable.table_key}.${column.column_key}`, message: `${column.column_label} has no formula` });
        else {
          try {
            compileFormula(expression);
          } catch (error) {
            issues.push({ field: `${dynamicTable.table_key}.${column.column_key}`, message: `${column.column_label}: ${(error as Error).message}` });
          }
        }
      }
    }
  }
  if (form.requires_signature && !bundle.fields.some((field) => field.field_type === 'signature')) {
    issues.push({ field: 'requires_signature', message: 'The form requires a signature but has no signature field' });
  }

  if (issues.length === 0) return;
  throw validationError(issues);
}

/** Formula sanity check on raw payloads: every identifier must resolve to a key on the form. */
function assertStructureParses(payload: FormStructurePayload): void {
  const keys = new Set<string>();
  for (const section of payload.sections) {
    for (const field of section.fields ?? []) keys.add(field.field_key);
    for (const dynamicTable of section.tables ?? []) {
      keys.add(dynamicTable.table_key);
      for (const column of dynamicTable.columns) keys.add(`${dynamicTable.table_key}.${column.column_key}`);
    }
  }
  const issues: { field: string; message: string }[] = [];
  for (const section of payload.sections) {
    for (const field of section.fields ?? []) {
      if (field.field_type === 'formula' && field.formula_expression) {
        for (const identifier of formulaIdentifiers(field.formula_expression)) {
          if (!keys.has(identifier) && !keys.has(identifier.split('.')[0]) && !FORMULA_FUNCTIONS.includes(identifier.toUpperCase())) {
            issues.push({ field: field.field_key, message: `Formula refers to "${identifier}", which is not a field on this form` });
          }
        }
      }
      const logic = field.conditional_json as { rules?: { field_key: string }[] } | null | undefined;
      for (const rule of logic?.rules ?? []) {
        if (!keys.has(rule.field_key)) {
          issues.push({ field: field.field_key, message: `Condition refers to "${rule.field_key}", which is not a field on this form` });
        }
      }
    }
  }
  if (issues.length) throw validationError(issues);
}

/* ─────────────────────────── renderer contract ─────────────────────────── */

function nextVersion(version: string): string {
  const parts = String(version ?? '1.0').split('.');
  const major = Number(parts[0]) || 1;
  const minor = Number(parts[1]) || 0;
  return `${major}.${minor + 1}`;
}

function serializeStructure(bundle: repo.StructureBundle) {
  return {
    sections: bundle.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        options: fieldOptions(field as unknown as StructureField),
        options_json: undefined,
      })),
      tables: section.tables.map((dynamicTable) => ({
        ...dynamicTable,
        columns: dynamicTable.columns.map((column) => ({
          ...column,
          options_json: parseOptions(column.options_json),
          validation_json: parseObject(column.validation_json),
        })),
      })),
    })),
    fieldCount: bundle.fields.filter((field) => !DECORATIVE_TYPES.has(String(field.field_type))).length,
    tableCount: bundle.tables.length,
  };
}

function parseOptions(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Turns a stored bundle into the payload `replaceStructure` expects (used by clone). */
function structurePayloadFromBundle(bundle: repo.StructureBundle): FormStructurePayload {
  return {
    name: 'copy',
    slug: null,
    description: null,
    form_type: 'STANDARD',
    layout_columns: 1,
    requires_signature: false,
    requires_attachments: false,
    allow_draft: true,
    auto_number_prefix: null,
    status: 'draft',
    sections: bundle.sections.map((section) => ({
      id: null,
      title: String(section.title),
      section_code: section.section_code,
      description: section.description,
      layout_columns: Number(section.layout_columns),
      is_repeatable: Boolean(section.is_repeatable),
      is_collapsible: Boolean(section.is_collapsible),
      is_collapsed: Boolean(section.is_collapsed),
      show_in_pdf: Boolean(section.show_in_pdf),
      page_break_before: Boolean(section.page_break_before),
      sort_order: Number(section.sort_order),
      status: section.status === 'inactive' ? 'inactive' : 'active',
      fields: section.fields.map((field) => ({
        id: null,
        section_id: 0,
        field_key: String(field.field_key),
        label: String(field.label),
        label_ta: field.label_ta,
        field_type: String(field.field_type) as FormStructurePayload['sections'][number]['fields'][number]['field_type'],
        placeholder: field.placeholder,
        help_text: field.help_text,
        default_value: field.default_value,
        validation_json: parseObject(field.validation_json),
        conditional_json: parseObject(field.conditional_json) as FormStructurePayload['sections'][number]['fields'][number]['conditional_json'],
        table_definition_id: field.table_definition_id,
        formula_expression: field.formula_expression,
        is_required: Boolean(field.is_required),
        is_readonly: Boolean(field.is_readonly),
        is_unique: Boolean(field.is_unique),
        show_in_pdf: Boolean(field.show_in_pdf),
        show_in_list: Boolean(field.show_in_list),
        column_width: Number(field.column_width ?? 12),
        min_value: field.min_value === null ? null : Number(field.min_value),
        max_value: field.max_value === null ? null : Number(field.max_value),
        min_length: field.min_length,
        max_length: field.max_length,
        regex_pattern: field.regex_pattern,
        sort_order: Number(field.sort_order),
        status: field.status === 'inactive' ? 'inactive' : 'active',
        options: field.options.map((option) => ({
          id: null,
          option_key: String(option.option_key),
          option_label: String(option.option_label),
          option_label_ta: option.option_label_ta,
          option_value: option.option_value,
          color: option.color,
          score: option.score === null ? null : Number(option.score),
          is_default: Boolean(option.is_default),
          sort_order: Number(option.sort_order),
        })),
      })),
      tables: section.tables.map((dynamicTable) => ({
        id: null,
        section_id: null,
        table_key: String(dynamicTable.table_key),
        table_name: String(dynamicTable.table_name),
        table_name_ta: dynamicTable.table_name_ta,
        description: dynamicTable.description,
        is_repeatable: Boolean(dynamicTable.is_repeatable),
        min_rows: Number(dynamicTable.min_rows),
        max_rows: dynamicTable.max_rows,
        show_row_numbers: Boolean(dynamicTable.show_row_numbers),
        show_totals: Boolean(dynamicTable.show_totals),
        show_in_pdf: Boolean(dynamicTable.show_in_pdf),
        sort_order: Number(dynamicTable.sort_order),
        status: dynamicTable.status === 'inactive' ? 'inactive' : 'active',
        columns: dynamicTable.columns.map((column) => ({
          id: null,
          column_key: String(column.column_key),
          column_label: String(column.column_label),
          column_label_ta: column.column_label_ta,
          column_type: String(column.column_type) as FormStructurePayload['sections'][number]['tables'][number]['columns'][number]['column_type'],
          options_json: parseOptions(column.options_json),
          formula_expression: column.formula_expression,
          default_value: column.default_value,
          width_pct: column.width_pct === null ? null : Number(column.width_pct),
          is_required: Boolean(column.is_required),
          is_editable: Boolean(column.is_editable),
          is_sortable: Boolean(column.is_sortable),
          is_total: Boolean(column.is_total),
          show_in_pdf: Boolean(column.show_in_pdf),
          validation_json: parseObject(column.validation_json),
          sort_order: Number(column.sort_order),
          status: column.status === 'inactive' ? 'inactive' : 'active',
        })),
      })),
    })),
  };
}

/** The structure in the shape `services/dynamic-submission.service.ts` consumes. */
export function toFormStructure(bundle: repo.StructureBundle, form: { requires_signature?: unknown; requires_attachments?: unknown; layout_columns?: unknown }): FormStructure {
  return {
    sections: bundle.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field, options: fieldOptions(field as unknown as StructureField) })) as unknown as FormStructure['sections'][number]['fields'],
      tables: bundle.tables
        .filter((dynamicTable) => Number(dynamicTable.section_id) === Number(section.id))
        .map((dynamicTable) => ({
          ...dynamicTable,
          columns: dynamicTable.columns.map((column) => ({ ...column, validation_json: parseObject(column.validation_json), options_json: parseOptions(column.options_json) })),
        })) as unknown as FormStructure['sections'][number]['tables'],
    })) as unknown as FormStructure['sections'],
    fields: bundle.fields.map((field) => ({ ...field, options: fieldOptions(field as unknown as StructureField) })) as unknown as FormStructure['fields'],
    tables: bundle.tables.map((dynamicTable) => ({
      ...dynamicTable,
      columns: dynamicTable.columns.map((column) => ({ ...column, validation_json: parseObject(column.validation_json), options_json: parseOptions(column.options_json) })),
    })) as unknown as FormStructure['tables'],
    requiresSignature: Boolean(form.requires_signature),
    requiresAttachments: Boolean(form.requires_attachments),
    layoutColumns: Number(form.layout_columns ?? 1),
  };
}

export { structurePayloadFromBundle, serializeStructure, evaluateConditions };

/* ─────────────────────────────── helpers ───────────────────────────────── */

async function log(actor: ServiceActor, action: string, entityId: number, description: string, values: unknown): Promise<void> {
  await writeActivityLog({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role ?? null,
    action,
    module: 'module',
    entityType: 'dynamic_module',
    entityId,
    description,
    newValues: values && typeof values === 'object' ? (values as Record<string, unknown>) : null,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
}

export async function assertModuleAccessible(moduleId: number, userId: number, roleSlug: string | null): Promise<repo.ModuleAccess> {
  const access = await repo.moduleAccessFor(moduleId, userId, roleSlug);
  if (!access) throw forbidden('This module has not been assigned to you');
  return access;
}

export async function moduleRow(moduleId: number) {
  const module = await repo.findModuleById(moduleId);
  if (!module) throw notFoundError('Module');
  return module;
}

/** Public helper for the panel: everything the caller may fill in. */
export async function availableModules(userId: number, roleSlug: string | null) {
  const modules = await repo.modulesForUser(userId, roleSlug, { publishedOnly: true });
  const out: Record<string, unknown>[] = [];
  for (const module of modules) {
    const forms = await repo.formsForModule(Number(module.id), true);
    const access = await repo.moduleAccessFor(Number(module.id), userId, roleSlug);
    out.push({
      ...module,
      access,
      forms: forms.map((form) => ({
        id: Number(form.id),
        name: form.name,
        description: form.description,
        form_type: form.form_type,
        version: form.version,
        requires_signature: Boolean(form.requires_signature),
        requires_attachments: Boolean(form.requires_attachments),
        allow_draft: Boolean(form.allow_draft),
      })),
    });
  }
  return out;
}

export async function pendingForReview(limit = 10) {
  const rows = await query<RowDataPacket>(
    `SELECT s.id, s.submission_number, s.title, s.status, s.submission_date, s.score_percentage,
        m.name AS module_name, f.name AS form_name, e.company_name
     FROM dynamic_form_submissions s
     JOIN dynamic_modules m ON m.id = s.module_id
     JOIN dynamic_forms f ON f.id = s.form_id
     LEFT JOIN employers e ON e.id = s.employer_id
     WHERE s.deleted_at IS NULL AND s.status IN ('submitted','under_review','changes_requested')
     ORDER BY s.submission_date ASC, s.id ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

export async function submissionCountForUser(userId: number): Promise<number> {
  return Number((await queryScalar<number>(
    'SELECT COUNT(*) FROM dynamic_form_submissions WHERE submitted_by = ? AND deleted_at IS NULL',
    [userId]
  )) ?? 0);
}
