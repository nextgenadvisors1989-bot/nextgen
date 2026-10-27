/**
 * Employer business logic: validation-driven CRUD, related-data assembly, portal
 * account provisioning and audit-trail writes. Routes stay thin; everything with
 * rules lives here.
 */
import { randomUUID } from 'node:crypto';
import { execute, queryOne, query, type RowDataPacket } from '@/lib/db/mysql';
import * as repo from '@/repositories/employer.repository';
import { employerCreateSchema, employerUpdateSchema, companyUnitSchema, departmentSchema } from '@/lib/validations/employer.validation';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { createUserAccount } from '@/lib/auth/auth';
import { generateTemporaryPassword } from '@/lib/auth/password';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { notifyUser, usersWithRole } from '@/lib/notifications/notification-service';
import { createActivationToken } from '@/lib/auth/activate';
import { APP_URL } from '@/lib/utils/constants';
import type { AuthUser } from '@/types/user';
import type { CompanyUnit, Department, Employer, EmployerStats } from '@/types/employer';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

export interface EmployerDetail {
  employer: Employer;
  units: (CompanyUnit & RowDataPacket)[];
  departments: (Department & RowDataPacket)[];
  stats: EmployerStats;
  portalUsers: { id: number; user_id: number; full_name: string; email: string; is_primary: number }[];
  employees: {
    id: number; employee_number: string; name: string; designation: string | null;
    department: string | null; mobile: string | null; date_of_joining: string | null; status: string;
  }[];
  audits: {
    id: number; assignment_number: string; audit_title: string; status: string; priority: string;
    start_date: string | null; due_date: string | null; auditor_name: string | null; progress_percent: number;
  }[];
  documents: {
    id: number; document_name: string; document_type: string; document_number: string | null;
    expiry_date: string | null; compliance_status: string; issuing_authority: string | null;
  }[];
}

export async function listEmployers(filters: repo.EmployerListFilters) {
  return repo.findEmployers(filters);
}

export async function getEmployerDetail(employerId: number): Promise<EmployerDetail | null> {
  const employer = await repo.findEmployerById(employerId);
  if (!employer) return null;

  const [units, departments, stats, portalUsers, employees, audits, documents] = await Promise.all([
    repo.findUnits(employerId),
    repo.findDepartments(employerId),
    repo.getEmployerStats(employerId),
    query<{ id: number; user_id: number; full_name: string; email: string; is_primary: number } & RowDataPacket>(
      `SELECT eu.id, eu.user_id, CONCAT(u.first_name, ' ', u.last_name) AS full_name, u.email, eu.is_primary
         FROM employer_users eu
         JOIN users u ON u.id = eu.user_id
        WHERE eu.employer_id = ?
        ORDER BY eu.is_primary DESC, u.first_name ASC`,
      [employerId]
    ),
    query<EmployerDetail['employees'][number] & RowDataPacket>(
      `SELECT e.id, e.employee_number, e.name, e.designation,
              COALESCE(d.department_name, e.department) AS department,
              e.mobile, e.date_of_joining, e.status
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.employer_id = ? AND e.deleted_at IS NULL
        ORDER BY e.name ASC
        LIMIT 200`,
      [employerId]
    ),
    query<EmployerDetail['audits'][number] & RowDataPacket>(
      `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.status, aa.priority, aa.start_date, aa.due_date,
              a.name AS auditor_name, aa.progress_percent
         FROM audit_assignments aa
         LEFT JOIN auditors a ON a.id = aa.auditor_id
        WHERE aa.employer_id = ? AND aa.deleted_at IS NULL
        ORDER BY aa.created_at DESC
        LIMIT 100`,
      [employerId]
    ),
    query<EmployerDetail['documents'][number] & RowDataPacket>(
      `SELECT id, document_name, document_type, document_number, expiry_date, compliance_status, issuing_authority
         FROM compliance_documents
        WHERE employer_id = ? AND deleted_at IS NULL
        ORDER BY (expiry_date IS NULL), expiry_date ASC
        LIMIT 200`,
      [employerId]
    ),
  ]);

  return { employer, units, departments, stats, portalUsers, employees, audits, documents };
}

export interface CreateEmployerResult {
  employerId: number;
  uuid: string;
  employerCode: string;
  portalCredentials?: { username: string; temporaryPassword: string; email: string };
  warnings: string[];
}

/**
 * Creates an employer, and optionally provisions a portal login for the primary
 * contact — emailing the temporary password (and activation link) to them.
 */
export async function createEmployer(input: unknown, actor: ActorContext): Promise<CreateEmployerResult> {
  const parsed = employerCreateSchema.parse(input);
  const uuid = randomUUID();
  const warnings: string[] = [];

  const duplicate = await repo.findEmployerByCode(parsed.employer_code);
  if (duplicate) {
    throw Object.assign(new Error(`Employer code ${parsed.employer_code} is already in use`), { code: 'ER_DUP_ENTRY' });
  }

  const {
    create_portal_user, portal_user_name, portal_user_email, portal_user_mobile,
    ...employerFields
  } = parsed;

  // number_of_units is always derived from company_units so the two can never disagree.
  const data: Record<string, unknown> = { ...employerFields, uuid, number_of_units: 0 };
  const employerId = await repo.createEmployer(data, actor.user.id);

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId,
    action: 'created',
    module: 'employer',
    entityType: 'employer',
    entityId: employerId,
    entityLabel: parsed.company_name,
    description: `Employer ${parsed.company_name} (${parsed.employer_code}) created`,
    newValues: data,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  let portalCredentials: CreateEmployerResult['portalCredentials'];

  if (create_portal_user && portal_user_email && portal_user_name) {
    const temporaryPassword = generateTemporaryPassword(12);
    const username = (portal_user_email.split('@')[0] ?? 'user').toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const [firstName, ...rest] = portal_user_name.trim().split(/\s+/);

    try {
      const userId = await createUserAccount({
        email: portal_user_email,
        username,
        password: temporaryPassword,
        firstName,
        lastName: rest.join(' ') || '-',
        mobile: portal_user_mobile ?? null,
        roleSlugs: ['employer'],
        createdBy: actor.user.id,
      });

      await execute('INSERT INTO employer_users (employer_id, user_id, is_primary) VALUES (?, ?, 1)', [employerId, userId]);

      const activationToken = await createActivationToken(userId, 72);
      const emailResult = await sendTemplateEmail({
        to: portal_user_email,
        templateCode: 'welcome.credentials',
        data: {
          recipient_name: portal_user_name,
          created_by_name: actor.user.fullName,
          username,
          temporary_password: temporaryPassword,
          role_name: 'Employer Administrator',
          scope_label: 'Company',
          scope_value: parsed.company_name,
          login_url: `${APP_URL}/login`,
          activate_url: `${APP_URL}/activate-account?token=${activationToken}`,
        },
        entityType: 'employer',
        entityId: employerId,
        sentBy: actor.user.id,
      });

      if (!emailResult.ok) warnings.push(`Credentials email could not be sent: ${emailResult.error ?? 'unknown error'}`);
      portalCredentials = { username, temporaryPassword, email: portal_user_email };
    } catch (error) {
      warnings.push(`Portal account could not be created: ${(error as Error).message}`);
    }
  }

  // Notify administrators that a new employer was onboarded.
  for (const adminUserId of await usersWithRole('admin')) {
    await notifyUser({
      userId: adminUserId,
      title: 'New employer onboarded',
      message: `${parsed.company_name} (${parsed.employer_code}) was added by ${actor.user.fullName}.`,
      type: 'success',
      category: 'EMPLOYER',
      actionUrl: `/admin/employers/${employerId}`,
      actionLabel: 'View Employer',
      entityType: 'employer',
      entityId: employerId,
      channels: ['in_app'],
    });
  }

  return { employerId, uuid, employerCode: parsed.employer_code, portalCredentials, warnings };
}

export async function updateEmployer(employerId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findEmployerById(employerId);
  if (!existing) return null;

  const parsed = employerUpdateSchema.parse(input);
  const { create_portal_user, portal_user_name, portal_user_email, portal_user_mobile, ...fields } = parsed;

  // Drop undefined keys so a partial update never nulls untouched columns.
  const data = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

  if (Object.keys(data).length > 0) {
    if (data.employer_code && data.employer_code !== existing.employer_code) {
      const clash = await repo.findEmployerByCode(String(data.employer_code));
      if (clash && clash.id !== employerId) {
        throw Object.assign(new Error(`Employer code ${data.employer_code} is already in use`), { code: 'ER_DUP_ENTRY' });
      }
    }

    await repo.updateEmployer(employerId, data, actor.user.id);
    await writeAuditTrail({
      tableName: 'employers',
      recordId: employerId,
      operation: 'UPDATE',
      changes: diffRecords(existing as unknown as Record<string, unknown>, data),
      changedBy: actor.user.id,
      changedByName: actor.user.fullName,
      ipAddress: actor.ip ?? null,
    });
    await writeActivityLog({
      userId: actor.user.id,
      userName: actor.user.fullName,
      userRole: actor.user.primaryRole,
      employerId,
      action: 'updated',
      module: 'employer',
      entityType: 'employer',
      entityId: employerId,
      entityLabel: existing.company_name,
      description: `Employer ${existing.company_name} updated`,
      oldValues: existing as unknown as Record<string, unknown>,
      newValues: data,
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }

  const employer = await repo.findEmployerById(employerId);
  return { employer, changedFields: Object.keys(data) };
}

export async function deleteEmployer(employerId: number, actor: ActorContext) {
  const existing = await repo.findEmployerById(employerId);
  if (!existing) return null;

  const blocking = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL
          AND status NOT IN ('Approved','Cancelled','Rejected')) AS openAudits`,
    [employerId]
  );
  const openAudits = Number(blocking?.openAudits ?? 0);
  if (openAudits > 0) {
    return { blocked: true as const, openAudits };
  }

  await repo.softDeleteEmployer(employerId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId,
    action: 'deleted',
    module: 'employer',
    entityType: 'employer',
    entityId: employerId,
    entityLabel: existing.company_name,
    description: `Employer ${existing.company_name} archived (soft delete)`,
    oldValues: existing as unknown as Record<string, unknown>,
    severity: 'medium',
    ipAddress: actor.ip ?? null,
  });
  return { blocked: false as const, openAudits: 0 };
}

// ── Units ────────────────────────────────────────────────────────────────

export async function listUnits(employerId: number, filters: { search?: string; status?: string } = {}) {
  return repo.findUnits(employerId, filters);
}

export async function createUnit(employerId: number, input: unknown, actor: ActorContext) {
  const employer = await repo.findEmployerById(employerId);
  if (!employer) return null;
  const parsed = companyUnitSchema.parse(input);
  const unitId = await repo.createUnit(employerId, parsed as Record<string, unknown>);
  await repo.syncUnitCount(employerId);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole, employerId,
    action: 'created', module: 'company_unit', entityType: 'company_unit', entityId: unitId,
    entityLabel: parsed.unit_name, description: `Unit "${parsed.unit_name}" added to ${employer.company_name}`,
    newValues: parsed as Record<string, unknown>, ipAddress: actor.ip ?? null,
  });
  return { unitId };
}

export async function updateUnit(unitId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findUnitById(unitId);
  if (!existing) return null;
  const parsed = companyUnitSchema.partial().parse(input);
  const data = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
  await repo.updateUnit(unitId, data);
  await repo.syncUnitCount(existing.employer_id);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: existing.employer_id, action: 'updated', module: 'company_unit',
    entityType: 'company_unit', entityId: unitId, entityLabel: existing.unit_name,
    description: `Unit "${existing.unit_name}" updated`,
    oldValues: existing as unknown as Record<string, unknown>, newValues: data, ipAddress: actor.ip ?? null,
  });
  return { updated: true };
}

export async function deleteUnit(unitId: number, actor: ActorContext) {
  const existing = await repo.findUnitById(unitId);
  if (!existing) return null;

  // A unit that still carries staff is not removable: the employees would be
  // left posted to a unit that no longer exists and the payroll registers would
  // disagree with the establishment record.
  const employees = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS total FROM employees WHERE unit_id = ? AND deleted_at IS NULL',
    [unitId]
  );
  if (Number(employees?.total ?? 0) > 0) {
    return { blocked: true as const, employeeCount: Number(employees?.total ?? 0) };
  }

  await repo.softDeleteUnit(unitId);
  await repo.syncUnitCount(existing.employer_id);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: existing.employer_id, action: 'deleted', module: 'company_unit',
    entityType: 'company_unit', entityId: unitId, entityLabel: existing.unit_name,
    description: `Unit "${existing.unit_name}" removed`, severity: 'medium', ipAddress: actor.ip ?? null,
  });
  return { blocked: false as const, employeeCount: 0 };
}

// ── Departments ──────────────────────────────────────────────────────────

export async function listDepartments(employerId: number, filters: { search?: string; status?: string; unitId?: number } = {}) {
  return repo.findDepartments(employerId, filters);
}

/**
 * A department may only be attached to a unit of the same establishment.
 *
 * Without this check the employer-scoped route would accept any unit id in the
 * body and file the department under a unit belonging to another company — the
 * register would then disagree with both establishments' records. The refusal
 * names the field, so the form highlights `unit_id` instead of showing a bare
 * error.
 */
async function assertUnitBelongsToEmployer(employerId: number, unitId: number | null | undefined) {
  if (unitId === null || unitId === undefined) return;
  const unit = await queryOne<RowDataPacket>(
    'SELECT id FROM company_units WHERE id = ? AND employer_id = ? AND deleted_at IS NULL LIMIT 1',
    [Number(unitId), employerId]
  );
  if (!unit) {
    throw Object.assign(new Error('That unit belongs to another establishment'), {
      code: 'VALIDATION_FAILED',
      issues: [{ field: 'unit_id', message: 'That unit belongs to another establishment — choose one of your own units' }],
    });
  }
}

export async function createDepartment(employerId: number, input: unknown, actor: ActorContext) {
  const employer = await repo.findEmployerById(employerId);
  if (!employer) return null;
  const parsed = departmentSchema.parse(input);
  await assertUnitBelongsToEmployer(employerId, parsed.unit_id ?? null);
  const departmentId = await repo.createDepartment(employerId, parsed as Record<string, unknown>);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole, employerId,
    action: 'created', module: 'department', entityType: 'department', entityId: departmentId,
    entityLabel: parsed.department_name,
    description: `Department "${parsed.department_name}" added to ${employer.company_name}`,
    newValues: parsed as Record<string, unknown>, ipAddress: actor.ip ?? null,
  });
  return { departmentId };
}

export async function updateDepartment(departmentId: number, input: unknown, actor: ActorContext) {
  const existing = await queryOne<Department & RowDataPacket>(
    'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL',
    [departmentId]
  );
  if (!existing) return null;
  const parsed = departmentSchema.partial().parse(input);
  if (parsed.unit_id !== undefined) {
    await assertUnitBelongsToEmployer(Number(existing.employer_id), parsed.unit_id);
  }
  const data = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
  await repo.updateDepartment(departmentId, data);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: existing.employer_id, action: 'updated', module: 'department', entityType: 'department',
    entityId: departmentId, entityLabel: existing.department_name,
    description: `Department "${existing.department_name}" updated`,
    oldValues: existing as unknown as Record<string, unknown>, newValues: data, ipAddress: actor.ip ?? null,
  });
  return { updated: true };
}

export async function deleteDepartment(departmentId: number, actor: ActorContext) {
  const existing = await queryOne<Department & RowDataPacket>(
    'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL',
    [departmentId]
  );
  if (!existing) return null;

  const employees = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS total FROM employees WHERE department_id = ? AND deleted_at IS NULL',
    [departmentId]
  );
  if (Number(employees?.total ?? 0) > 0) {
    return { blocked: true as const, employeeCount: Number(employees?.total ?? 0) };
  }

  await repo.softDeleteDepartment(departmentId);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: existing.employer_id, action: 'deleted', module: 'department', entityType: 'department',
    entityId: departmentId, entityLabel: existing.department_name,
    description: `Department "${existing.department_name}" removed`, severity: 'medium', ipAddress: actor.ip ?? null,
  });
  return { blocked: false as const, employeeCount: 0 };
}

/** Field-level before/after map for the audit trail. */
function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key];
    const normalize = (input: unknown) => (input === null || input === undefined ? '' : String(input));
    if (normalize(previous) !== normalize(value)) {
      changes[key] = { from: previous ?? null, to: value ?? null };
    }
  }
  return changes;
}

export { employerOptionsBySearch } from './employer-options';
