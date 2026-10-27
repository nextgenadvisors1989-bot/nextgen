/**
 * Employee lifecycle: registration across the 14-step onboarding wizard,
 * sub-record management, portal-login provisioning and statistics. Every
 * mutation writes an activity-log entry and, where fields change, an
 * audit-trail diff — the employee record is a statutory document.
 */
import { randomUUID } from 'node:crypto';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction, type TxClient } from '@/lib/db/transactions';
import { applyColumnDefaults } from '@/lib/db/column-defaults';
import * as repo from '@/repositories/employee.repository';
import {
  employeeCreateSchema, employeeUpdateSchema,
  nomineeSchema, qualificationSchema, experienceSchema, dependentSchema, referenceSchema,
  interviewSchema, employeeDocumentSchema, serviceRecordSchema, checklistEntrySchema,
} from '@/lib/validations/employee.validation';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { SELF_EDITABLE_FIELDS } from '@/lib/employee/self-service-fields';
import { DOCUMENT_TYPES } from '@/types/employee';
import { findFile, saveUploads } from '@/lib/files/file-service';
import { createUserAccount } from '@/lib/auth/auth';
import { generateTemporaryPassword } from '@/lib/auth/password';
import { createActivationToken } from '@/lib/auth/activate';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { notifyMany, usersWithRole } from '@/lib/notifications/notification-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { APP_URL } from '@/lib/utils/constants';
import type { AuthUser } from '@/types/user';
import type { Employee } from '@/types/employee';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

export interface EmployeeDetail {
  employee: repo.EmployeeListRow;
  stats: Awaited<ReturnType<typeof repo.getEmployeeStats>>;
  qualifications: RowDataPacket[];
  experience: RowDataPacket[];
  dependents: RowDataPacket[];
  references: RowDataPacket[];
  nominees: RowDataPacket[];
  serviceRecords: RowDataPacket[];
  documents: RowDataPacket[];
  checklist: RowDataPacket[];
  interview: RowDataPacket | null;
  salaryStructure: RowDataPacket | null;
  login: { id: number; username: string; email: string; status: string; is_first_login: number; last_login_at: string | null } | null;
}

const WAGE_FIELDS = ['basic_salary', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'] as const;

/** Gross salary is always derived from the wage heads, never entered by hand. */
export function grossFromWages(fields: Record<string, unknown>): number {
  return WAGE_FIELDS.reduce((total, field) => total + Number(fields[field] ?? 0), 0);
}

export async function listEmployees(filters: repo.EmployeeListFilters) {
  return repo.findEmployees(filters);
}

export async function getEmployeeDetail(
  employeeId: number,
  options: {
    /**
     * Whether to include the portal-login block. The platform's own register shows
     * it; an establishment's view of its own staff does not, because a login's
     * username and last sign-in are platform account data, not employment data.
     */
    includeLogin?: boolean;
  } = {}
): Promise<EmployeeDetail | null> {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;

  const [stats, qualifications, experience, dependents, references, nominees, serviceRecords, documents, checklist, interview, salaryStructure, login] =
    await Promise.all([
      repo.getEmployeeStats(employeeId),
      repo.listQualifications(employeeId),
      repo.listExperience(employeeId),
      repo.listDependents(employeeId),
      repo.listReferences(employeeId),
      repo.listNominees(employeeId),
      repo.listServiceRecords(employeeId),
      repo.listDocuments(employeeId),
      repo.listChecklist(employeeId),
      repo.findInterview(employeeId),
      repo.getSalaryStructure(employeeId),
      employee.user_id
        ? queryOne<RowDataPacket>(
            'SELECT id, username, email, status, is_first_login, last_login_at FROM users WHERE id = ? LIMIT 1',
            [employee.user_id]
          )
        : Promise.resolve(null),
    ]);

  return {
    employee, stats, qualifications, experience, dependents, references, nominees,
    serviceRecords, documents, checklist, interview, salaryStructure,
    login: options.includeLogin === false ? null : login ? (login as unknown as EmployeeDetail['login']) : null,
  };
}

export interface CreateEmployeeResult {
  employeeId: number;
  employeeNumber: string;
  grossSalary: number;
  credentials?: { username: string; temporaryPassword: string; email: string };
  warnings: string[];
}

/** Inserts child rows inside the caller's transaction. */
async function insertChildren(
  tx: TxClient,
  table: string,
  employeeId: number,
  rows: Record<string, unknown>[],
  createdBy: number
): Promise<number> {
  if (!rows.length) return 0;
  let inserted = 0;
  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => row[key] !== undefined);
    const values = columns.map((column) => row[column] ?? null);
    await tx.insert(
      `INSERT INTO ${table} (employee_id, ${columns.join(', ')}, created_by)
       VALUES (?, ${columns.map(() => '?').join(', ')}, ?)`,
      [employeeId, ...values, createdBy]
    );
    inserted += 1;
  }
  return inserted;
}

/**
 * Registers an employee from the onboarding wizard: master record, every child
 * table, the personal-file checklist, and (optionally) a portal login whose
 * temporary password is emailed to the employee.
 */
export async function createEmployee(input: unknown, actor: ActorContext): Promise<CreateEmployeeResult> {
  const parsed = employeeCreateSchema.parse(input);
  const warnings: string[] = [];

  const employeeNumber = parsed.employee_number?.trim() || (await nextDocumentNumber('employee'));

  if (await repo.employeeNumberExists(employeeNumber)) {
    throw Object.assign(new Error(`Employee number ${employeeNumber} is already in use`), { code: 'ER_DUP_ENTRY' });
  }
  if (parsed.aadhaar_number && (await repo.aadhaarExists(parsed.aadhaar_number))) {
    throw Object.assign(new Error('An employee with this Aadhaar number already exists'), { code: 'ER_DUP_ENTRY' });
  }

  const {
    nominees, qualifications, experience, dependents, references, interview, checklist,
    create_login, login_username, login_email, login_mobile, document_file_ids,
    ...scalarInput
  } = parsed;

  const wageFields = Object.fromEntries(WAGE_FIELDS.map((field) => [field, scalarInput[field] ?? 0]));
  const grossSalary = grossFromWages(wageFields);

  const data: Record<string, unknown> = {
    ...scalarInput,
    ...wageFields,
    gross_salary: grossSalary,
    employee_number: employeeNumber,
    uuid: randomUUID(),
    // A permanent address that mirrors the present one is stored once.
    permanent_address: scalarInput.is_permanent_same_as_present
      ? scalarInput.present_address
      : scalarInput.permanent_address,
  };
  await applyDesignation(data, Number(scalarInput.employer_id ?? actor.user.employerId ?? 0) || null);
  delete data.nominees;
  delete data.qualifications;
  delete data.experience;
  delete data.dependents;
  delete data.references;
  delete data.interview;
  delete data.checklist;
  delete data.create_login;
  delete data.login_username;
  delete data.login_email;
  delete data.login_mobile;
  delete data.document_file_ids;

  const record = await applyColumnDefaults('employees', data);

  const employeeId = await withTransaction(async (tx) => {
    const id = await tx.insert(
      `INSERT INTO employees (${Object.keys(record).join(', ')}, created_by, updated_by)
       VALUES (${Object.keys(record).map(() => '?').join(', ')}, ?, ?)`,
      [...Object.values(record), actor.user.id, actor.user.id]
    );

    await insertChildren(tx, 'employee_nominees', id, nominees as Record<string, unknown>[], actor.user.id);
    await insertChildren(tx, 'employee_qualifications', id, qualifications as Record<string, unknown>[], actor.user.id);
    await insertChildren(tx, 'employee_experience', id, experience as Record<string, unknown>[], actor.user.id);
    await insertChildren(tx, 'employee_dependents', id, dependents as Record<string, unknown>[], actor.user.id);
    await insertChildren(tx, 'employee_references', id, references as Record<string, unknown>[], actor.user.id);

    if (interview && Object.values(interview).some((value) => value !== null && value !== '')) {
      await insertChildren(tx, 'employee_interviews', id, [interview as Record<string, unknown>], actor.user.id);
    }

    // Personal-file checklist: every item gets a row so progress is measurable.
    const items = await tx.query<{ id: number } & RowDataPacket>(
      'SELECT id FROM personal_file_checklist_items ORDER BY sort_order ASC'
    );
    const checkedMap = new Map(checklist.map((entry) => [entry.item_id, entry]));
    for (const item of items) {
      const entry = checkedMap.get(Number(item.id));
      await tx.insert(
        `INSERT INTO employee_file_checklist (employee_id, item_id, is_checked, checked_by, checked_at, remarks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id, item.id, entry?.is_checked ? 1 : 0,
          entry?.is_checked ? actor.user.id : null,
          entry?.is_checked ? new Date() : null,
          entry?.remarks ?? null,
        ]
      );
    }

    // Attach vault uploads captured during the wizard to the new employee.
    if (document_file_ids.length) {
      const placeholders = document_file_ids.map(() => '?').join(', ');
      await tx.query(
        `UPDATE files SET entity_type = 'employee', entity_id = ?
          WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        [id, ...document_file_ids]
      );
    }

    return id;
  });

  // Portal login (optional): create the user, link it, email the credentials.
  let credentials: CreateEmployeeResult['credentials'];
  if (create_login && login_email) {
    const temporaryPassword = generateTemporaryPassword(12);
    const username = (login_username || login_email.split('@')[0] || 'employee')
      .toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const [firstName, ...rest] = parsed.name.trim().split(/\s+/);

    try {
      const userId = await createUserAccount({
        email: login_email,
        username,
        password: temporaryPassword,
        firstName,
        lastName: rest.join(' ') || '-',
        mobile: login_mobile ?? parsed.mobile ?? null,
        roleSlugs: ['employee'],
        createdBy: actor.user.id,
      });

      await query('UPDATE employees SET user_id = ? WHERE id = ?', [userId, employeeId]);

      const activationToken = await createActivationToken(userId, 72);
      const emailResult = await sendTemplateEmail({
        to: login_email,
        templateCode: 'welcome.credentials',
        data: {
          recipient_name: parsed.name,
          created_by_name: actor.user.fullName,
          username,
          temporary_password: temporaryPassword,
          role_name: 'Employee Self-Service',
          scope_label: 'Employee No.',
          scope_value: employeeNumber,
          login_url: `${APP_URL}/login`,
          activate_url: `${APP_URL}/activate-account?token=${activationToken}`,
        },
        entityType: 'employee',
        entityId: employeeId,
        sentBy: actor.user.id,
      });

      if (!emailResult.ok) warnings.push(`Credentials email could not be sent: ${emailResult.error ?? 'unknown error'}`);
      credentials = { username, temporaryPassword, email: login_email };
    } catch (error) {
      warnings.push(`Portal account could not be created: ${(error as Error).message}`);
    }
  }

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: parsed.employer_id,
    action: 'created',
    module: 'employee',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: `${parsed.name} (${employeeNumber})`,
    description: `Employee ${parsed.name} (${employeeNumber}) registered`,
    newValues: { ...data, credentials_created: Boolean(credentials) },
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  for (const adminUserId of await usersWithRole('admin')) {
    await notifyMany([adminUserId], {
      title: 'New employee registered',
      message: `${parsed.name} (${employeeNumber}) was added by ${actor.user.fullName}.`,
      type: 'success',
      category: 'EMPLOYEE',
      actionUrl: `/admin/employees/${employeeId}`,
      actionLabel: 'View employee',
      entityType: 'employee',
      entityId: employeeId,
      channels: ['in_app'],
    });
  }

  return { employeeId, employeeNumber, grossSalary, credentials, warnings };
}

/** Partial update of the master record. Child tables have their own endpoints. */
export async function updateEmployee(employeeId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findEmployeeById(employeeId);
  if (!existing) return null;

  const parsed = employeeUpdateSchema.parse(input);
  const {
    nominees, qualifications, experience, dependents, references, interview, checklist,
    create_login, login_username, login_email, login_mobile,
    document_file_ids = [],
    ...scalarInput
  } = parsed;

  // Portal credentials are provisioned at creation; the edit form never touches them.
  void create_login; void login_username; void login_email; void login_mobile;

  const data = Object.fromEntries(Object.entries(scalarInput).filter(([, value]) => value !== undefined));

  // Recompute gross whenever any wage head is touched.
  if (WAGE_FIELDS.some((field) => field in data)) {
    const merged: Record<string, unknown> = {};
    for (const field of WAGE_FIELDS) {
      merged[field] = field in data ? data[field] : (existing as unknown as Record<string, unknown>)[field];
    }
    data.gross_salary = grossFromWages(merged);
  }

  if (data.is_permanent_same_as_present) {
    data.permanent_address = data.present_address ?? existing.present_address;
  }
  if ('designation_id' in data) await applyDesignation(data, Number(existing.employer_id));

  if (typeof data.employee_number === 'string' && data.employee_number !== existing.employee_number) {
    if (await repo.employeeNumberExists(data.employee_number, employeeId)) {
      throw Object.assign(new Error(`Employee number ${data.employee_number} is already in use`), { code: 'ER_DUP_ENTRY' });
    }
  }
  if (typeof data.aadhaar_number === 'string' && data.aadhaar_number && data.aadhaar_number !== existing.aadhaar_number) {
    if (await repo.aadhaarExists(data.aadhaar_number, employeeId)) {
      throw Object.assign(new Error('Another employee already uses this Aadhaar number'), { code: 'ER_DUP_ENTRY' });
    }
  }

  const record = await applyColumnDefaults('employees', data);
  const changedFields = Object.keys(record);

  await withTransaction(async (tx) => {
    if (changedFields.length) {
      await tx.execute(
        `UPDATE employees SET ${changedFields.map((field) => `${field} = ?`).join(', ')}, updated_by = ?
          WHERE id = ? AND deleted_at IS NULL`,
        [...changedFields.map((field) => record[field]), actor.user.id, employeeId]
      );
    }

    // Replacement semantics for collections: rows sent replace rows stored.
    if (nominees !== undefined) {
      await tx.execute('UPDATE employee_nominees SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      await insertChildren(tx, 'employee_nominees', employeeId, nominees as Record<string, unknown>[], actor.user.id);
    }
    if (qualifications !== undefined) {
      await tx.execute('UPDATE employee_qualifications SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      await insertChildren(tx, 'employee_qualifications', employeeId, qualifications as Record<string, unknown>[], actor.user.id);
    }
    if (experience !== undefined) {
      await tx.execute('UPDATE employee_experience SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      await insertChildren(tx, 'employee_experience', employeeId, experience as Record<string, unknown>[], actor.user.id);
    }
    if (dependents !== undefined) {
      await tx.execute('UPDATE employee_dependents SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      await insertChildren(tx, 'employee_dependents', employeeId, dependents as Record<string, unknown>[], actor.user.id);
    }
    if (references !== undefined) {
      await tx.execute('UPDATE employee_references SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      await insertChildren(tx, 'employee_references', employeeId, references as Record<string, unknown>[], actor.user.id);
    }
    if (interview !== undefined && interview !== null) {
      await tx.execute('UPDATE employee_interviews SET deleted_at = NOW() WHERE employee_id = ?', [employeeId]);
      if (Object.values(interview).some((value) => value !== null && value !== '')) {
        await insertChildren(tx, 'employee_interviews', employeeId, [interview as Record<string, unknown>], actor.user.id);
      }
    }
    if (checklist !== undefined) {
      for (const entry of checklist) {
        await tx.execute(
          `INSERT INTO employee_file_checklist (employee_id, item_id, is_checked, checked_by, checked_at, remarks)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_checked = VALUES(is_checked), checked_by = VALUES(checked_by),
                                   checked_at = VALUES(checked_at), remarks = VALUES(remarks)`,
          [
            employeeId, entry.item_id, entry.is_checked ? 1 : 0,
            entry.is_checked ? actor.user.id : null,
            entry.is_checked ? new Date() : null,
            entry.remarks ?? null,
          ]
        );
      }
    }
    if (document_file_ids.length) {
      const placeholders = document_file_ids.map(() => '?').join(', ');
      await tx.query(
        `UPDATE files SET entity_type = 'employee', entity_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        [employeeId, ...document_file_ids]
      );
    }
  });

  if (changedFields.length) {
    await writeAuditTrail({
      tableName: 'employees',
      recordId: employeeId,
      operation: 'UPDATE',
      changes: Object.fromEntries(
        changedFields.map((field) => [
          field,
          { from: (existing as unknown as Record<string, unknown>)[field] ?? null, to: data[field] ?? null },
        ])
      ),
      changedBy: actor.user.id,
      changedByName: actor.user.fullName,
      ipAddress: actor.ip ?? null,
    });

    await writeActivityLog({
      userId: actor.user.id,
      userName: actor.user.fullName,
      userRole: actor.user.primaryRole,
      employerId: existing.employer_id,
      action: 'updated',
      module: 'employee',
      entityType: 'employee',
      entityId: employeeId,
      entityLabel: `${existing.name} (${existing.employee_number})`,
      description: `Employee ${existing.name} updated (${changedFields.join(', ')})`,
      newValues: data,
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }

  return { employee: await repo.findEmployeeById(employeeId), changedFields };
}

export async function deleteEmployee(employeeId: number, actor: ActorContext) {
  const existing = await repo.findEmployeeById(employeeId);
  if (!existing) return null;

  await repo.softDeleteEmployee(employeeId, actor.user.id);

  if (existing.user_id) {
    await query("UPDATE users SET status = 'inactive', updated_by = ? WHERE id = ?", [actor.user.id, existing.user_id]);
  }

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: existing.employer_id,
    action: 'deleted',
    module: 'employee',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: `${existing.name} (${existing.employee_number})`,
    description: `Employee ${existing.name} (${existing.employee_number}) archived`,
    oldValues: existing as unknown as Record<string, unknown>,
    severity: 'medium',
    ipAddress: actor.ip ?? null,
  });

  return { archived: true, loginDisabled: Boolean(existing.user_id) };
}

/**
 * Reverses an archive: the employee record and their self-service login come
 * back together, because payroll and attendance history never left.
 */
export async function restoreEmployee(employeeId: number, actor: ActorContext) {
  const existing = await repo.findEmployeeForRestore(employeeId);
  if (!existing) return null;
  if (!existing.deleted_at) return { restored: false, loginReactivated: false, alreadyActive: true };

  await repo.restoreEmployee(employeeId, actor.user.id);

  if (existing.user_id) {
    await query("UPDATE users SET status = 'active', updated_by = ? WHERE id = ?", [actor.user.id, existing.user_id]);
  }

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: existing.employer_id,
    action: 'restored',
    module: 'employee',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: `${existing.name} (${existing.employee_number})`,
    description: `Employee ${existing.name} (${existing.employee_number}) restored from the archive`,
    newValues: { status: 'active', deleted_at: null },
    severity: 'medium',
    ipAddress: actor.ip ?? null,
  });

  return { restored: true, loginReactivated: Boolean(existing.user_id) };
}

// ── Child records: add / update / delete from the detail tabs ────────────

export type EmployeeResource =
  | 'qualifications' | 'experience' | 'dependents' | 'references' | 'nominees'
  | 'service-records' | 'documents' | 'checklist';

interface ResourceDefinition {
  table: string;
  label: string;
  module: string;
  parse: (input: unknown) => Record<string, unknown>;
  /** Columns that must never be patched from the API. */
  guarded?: string[];
  /** Set to false for registers that have no deleted_at column. */
  softDelete?: boolean;
}

const RESOURCES: Record<EmployeeResource, ResourceDefinition> = {
  qualifications: {
    table: 'employee_qualifications', label: 'Qualification', module: 'employee_qualification',
    parse: (input) => qualificationSchema.parse(input) as Record<string, unknown>,
  },
  experience: {
    table: 'employee_experience', label: 'Experience record', module: 'employee_experience',
    parse: (input) => experienceSchema.parse(input) as Record<string, unknown>,
  },
  dependents: {
    table: 'employee_dependents', label: 'Dependent', module: 'employee_dependent',
    parse: (input) => dependentSchema.parse(input) as Record<string, unknown>,
  },
  references: {
    table: 'employee_references', label: 'Reference', module: 'employee_reference',
    parse: (input) => referenceSchema.parse(input) as Record<string, unknown>,
  },
  nominees: {
    table: 'employee_nominees', label: 'Nominee', module: 'employee_nominee',
    parse: (input) => nomineeSchema.parse(input) as Record<string, unknown>,
  },
  'service-records': {
    table: 'employee_service_records', label: 'Service record', module: 'employee_service_record',
    parse: (input) => serviceRecordSchema.parse(input) as Record<string, unknown>,
  },
  documents: {
    table: 'employee_documents', label: 'Document', module: 'employee_document',
    parse: (input) => employeeDocumentSchema.parse(input) as Record<string, unknown>,
  },
  checklist: {
    table: 'employee_file_checklist', label: 'Checklist item', module: 'employee_file_checklist',
    parse: (input) => checklistEntrySchema.parse(input) as Record<string, unknown>,
    guarded: ['item_id'],
    // The checklist register keeps its 16 rows forever: clearing a tick flips
    // the flag instead of soft-deleting the row, and the table has no deleted_at.
    softDelete: false,
  },
};

/**
 * Loads one child collection for an employee. Shared by the administrator's
 * employee tabs and the employer's own staff screens — the rows are identical,
 * only the caller's authority differs.
 */
export async function loadEmployeeCollection(resource: EmployeeResource, employeeId: number): Promise<RowDataPacket[]> {
  switch (resource) {
    case 'qualifications':
      return query<RowDataPacket>('SELECT * FROM employee_qualifications WHERE employee_id = ? AND deleted_at IS NULL ORDER BY year_of_passing DESC, id DESC', [employeeId]);
    case 'experience':
      return query<RowDataPacket>('SELECT * FROM employee_experience WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC', [employeeId]);
    case 'dependents':
      return query<RowDataPacket>('SELECT * FROM employee_dependents WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id ASC', [employeeId]);
    case 'references':
      return query<RowDataPacket>('SELECT * FROM employee_references WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id ASC', [employeeId]);
    case 'nominees':
      return query<RowDataPacket>('SELECT * FROM employee_nominees WHERE employee_id = ? AND deleted_at IS NULL ORDER BY form_type ASC, id ASC', [employeeId]);
    case 'service-records':
      return query<RowDataPacket>('SELECT * FROM employee_service_records WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC', [employeeId]);
    case 'documents':
      return query<RowDataPacket>(
        `SELECT ed.*, f.original_name, f.mime_type, f.size_bytes, f.uuid AS file_uuid
           FROM employee_documents ed
           LEFT JOIN files f ON f.id = ed.file_id
          WHERE ed.employee_id = ? AND ed.deleted_at IS NULL
          ORDER BY ed.created_at DESC`,
        [employeeId]
      );
    case 'checklist':
      return query<RowDataPacket>(
        `SELECT ci.id AS item_id, ci.item_code, ci.item_label, ci.sort_order, ci.is_mandatory,
                COALESCE(fc.is_checked, 0) AS is_checked, fc.checked_at, fc.remarks
           FROM personal_file_checklist_items ci
           LEFT JOIN employee_file_checklist fc ON fc.item_id = ci.id AND fc.employee_id = ?
          ORDER BY ci.sort_order ASC`,
        [employeeId]
      );
    default:
      return [];
  }
}

export function resourceDefinition(resource: string): ResourceDefinition | null {
  return RESOURCES[resource as EmployeeResource] ?? null;
}

export async function addEmployeeRecord(
  employeeId: number,
  resource: EmployeeResource,
  input: unknown,
  actor: ActorContext
) {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;
  const definition = RESOURCES[resource];
  const parsed = definition.parse(input);

  const columns = Object.keys(parsed).filter((key) => parsed[key] !== undefined);
  const values = columns.map((column) => parsed[column] ?? null);

  const recordId = await withTransaction(async (tx) => {
    // Checklist rows are unique per (employee, item) — upsert instead of insert.
    if (resource === 'checklist') {
      await tx.execute(
        `INSERT INTO employee_file_checklist (employee_id, item_id, is_checked, checked_by, checked_at, remarks)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_checked = VALUES(is_checked), checked_by = VALUES(checked_by),
                                 checked_at = VALUES(checked_at), remarks = VALUES(remarks)`,
        [
          employeeId, parsed.item_id, parsed.is_checked ? 1 : 0,
          parsed.is_checked ? actor.user.id : null,
          parsed.is_checked ? new Date() : null,
          parsed.remarks ?? null,
        ]
      );
      const row = await tx.queryOne<RowDataPacket>(
        'SELECT id FROM employee_file_checklist WHERE employee_id = ? AND item_id = ?',
        [employeeId, parsed.item_id]
      );
      return Number(row?.id ?? 0);
    }

    // Service records inherit the employee's employer unless another is named.
    if (resource === 'service-records' && !parsed.employer_id) {
      parsed.employer_id = employee.employer_id;
      columns.push('employer_id');
      values.push(employee.employer_id);
    }

    // Documents may arrive with a vault file id; link the file to this employee.
    if (resource === 'documents' && parsed.file_id) {
      await tx.query(
        "UPDATE files SET entity_type = 'employee', entity_id = ? WHERE id = ? AND deleted_at IS NULL",
        [employeeId, parsed.file_id]
      );
    }

    return tx.insert(
      `INSERT INTO ${definition.table} (employee_id, ${columns.join(', ')}, created_by)
       VALUES (?, ${columns.map(() => '?').join(', ')}, ?)`,
      [employeeId, ...values, actor.user.id]
    );
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: employee.employer_id, action: 'created', module: definition.module,
    entityType: definition.table, entityId: recordId,
    entityLabel: `${definition.label} for ${employee.name}`,
    description: `${definition.label} added to ${employee.name} (${employee.employee_number})`,
    newValues: parsed, ipAddress: actor.ip ?? null,
  });

  return { recordId };
}

export async function updateEmployeeRecord(
  employeeId: number,
  resource: EmployeeResource,
  recordId: number,
  input: unknown,
  actor: ActorContext
) {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;
  const definition = RESOURCES[resource];
  const parsed = definition.parse(input);

  const columns = Object.keys(parsed).filter(
    (key) => parsed[key] !== undefined && !(definition.guarded ?? []).includes(key)
  );
  if (!columns.length) return { updated: 0 };

  // Not every child table is soft-deletable (the checklist is a fixed register).
  const softDelete = definition.softDelete !== false ? ' AND deleted_at IS NULL' : '';

  const result = await withTransaction((tx) =>
    tx.execute(
      `UPDATE ${definition.table} SET ${columns.map((column) => `${column} = ?`).join(', ')}
        WHERE id = ? AND employee_id = ?${softDelete}`,
      [...columns.map((column) => parsed[column]), recordId, employeeId]
    )
  );

  if (result.affectedRows) {
    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: employee.employer_id, action: 'updated', module: definition.module,
      entityType: definition.table, entityId: recordId,
      entityLabel: `${definition.label} for ${employee.name}`,
      description: `${definition.label} updated for ${employee.name} (${employee.employee_number})`,
      newValues: parsed, ipAddress: actor.ip ?? null,
    });
  }

  return { updated: result.affectedRows };
}

export async function deleteEmployeeRecord(
  employeeId: number,
  resource: EmployeeResource,
  recordId: number,
  actor: ActorContext
) {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;
  const definition = RESOURCES[resource];

  // The personal file is a fixed 16-item checklist: clearing a tick keeps the item.
  const result = await withTransaction((tx) =>
    resource === 'checklist'
      ? tx.execute(
          `UPDATE ${definition.table} SET is_checked = 0, checked_by = NULL, checked_at = NULL
            WHERE id = ? AND employee_id = ?`,
          [recordId, employeeId]
        )
      : tx.execute(
          `UPDATE ${definition.table} SET deleted_at = NOW()
            WHERE id = ? AND employee_id = ? AND deleted_at IS NULL`,
          [recordId, employeeId]
        )
  );

  if (result.affectedRows) {
    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: employee.employer_id, action: 'deleted', module: definition.module,
      entityType: definition.table, entityId: recordId,
      entityLabel: `${definition.label} for ${employee.name}`,
      description: `${definition.label} removed from ${employee.name} (${employee.employee_number})`,
      severity: 'medium', ipAddress: actor.ip ?? null,
    });
  }

  return { deleted: result.affectedRows };
}

// ── Options & lookups ────────────────────────────────────────────────────

export async function employeeOptions(search?: string, employerId?: number) {
  return repo.employeeOptions(search, employerId);
}

import { applyDesignation, designationPicker } from '@/services/designation.service';

export async function employeeLookups(employerId?: number) {
  const { employerOptionsBySearch } = await import('@/services/employer-options');
  const [employers, designations, checklistItems, states, wageHeads, designationMaster] = await Promise.all([
    employerOptionsBySearch(undefined, 100),
    repo.distinctDesignations(employerId),
    repo.checklistItems(),
    query<RowDataPacket>('SELECT DISTINCT state FROM employees WHERE deleted_at IS NULL AND state IS NOT NULL ORDER BY state'),
    query<RowDataPacket>(
      `SELECT head_code AS code, head_name AS name, head_name_ta AS name_ta
         FROM payroll_heads
        WHERE head_type = 'Earning' AND status = 'active'
        ORDER BY sort_order ASC, id ASC`
    ),
    designationPicker({ userId: 0, isAdmin: !employerId, employerId: employerId ?? null }),
  ]);

  return {
    employers,
    designations,
    designationMaster,
    checklistItems: checklistItems.map((row) => ({
      id: Number(row.id),
      item_code: String(row.item_code),
      item_label: String(row.item_label),
      sort_order: Number(row.sort_order),
      is_mandatory: Number(row.is_mandatory),
    })),
    states: states.map((row) => String(row.state)),
    wageHeads: wageHeads.map((row) => ({
      code: String(row.code),
      name: String(row.name),
      name_ta: (row.name_ta as string | null) ?? null,
    })),
  };
}

/** Recomputes gross_salary for every employee of an employer (used after wage-head edits). */
export async function recalculateGrossSalaries(employerId: number): Promise<number> {
  const result = await query<{ id: number } & RowDataPacket>(
    'SELECT id FROM employees WHERE employer_id = ? AND deleted_at IS NULL',
    [employerId]
  );
  let updated = 0;
  for (const row of result) {
    const employee = await repo.findEmployeeById(Number(row.id));
    if (!employee) continue;
    const gross = grossFromWages(employee as unknown as Record<string, unknown>);
    if (Number(employee.gross_salary ?? 0) !== gross) {
      await repo.updateEmployee(Number(row.id), { gross_salary: gross }, 0);
      updated += 1;
    }
  }
  return updated;
}


// ─── Employee self-service ───────────────────────────────────────────────────
//
// The employee panel is not a second employee register: it is one employee's own
// record, keyed on the session's employee id and never on anything the caller
// sends. The three rules that shape this layer:
//
//   * A field is writable if and only if it appears in SELF_EDITABLE_FIELDS. A
//     write to anything else — the employee number, the designation, the wages,
//     the establishment — is refused with a 422 naming the field, rather than
//     being dropped silently and leaving the screen lying about what it saved.
//   * Documents belong to the employee who uploaded them. Withdrawing a document
//     filed against somebody else is a 404, and a document the employer has
//     already verified cannot be withdrawn at all (409): verification is an act
//     of the establishment, and the employee cannot undo it unilaterally.
//   * Every mutation writes an activity-log entry against the employee's own
//     establishment, so the employer sees it in the trail exactly as it sees the
//     platform's own edits.

/** Columns that belong to the platform's account bookkeeping, never a profile view. */
const ACCOUNT_COLUMNS = ['password_hash', 'username', 'user_id', 'is_first_login'];

/** Drops the portal-account columns from an employee row. */
function withoutAccountColumns<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const column of ACCOUNT_COLUMNS) delete copy[column];
  return copy;
}

/**
 * One value rendered for comparison: an empty value, a boolean and a date all
 * have a single spelling, so a form that posts back what it was shown is not
 * mistaken for a change.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

/** Raises the envelope `handleRouteError` turns into a 422 with named fields. */
function refuseFields(fields: { field: string; message: string }[]): never {
  throw Object.assign(new Error('Validation failed. Please correct the highlighted fields.'), {
    code: 'VALIDATION_FAILED',
    issues: fields,
  });
}

export interface MyProfile {
  employee: Record<string, unknown>;
  stats: Awaited<ReturnType<typeof repo.getEmployeeStats>>;
  salaryStructure: Awaited<ReturnType<typeof repo.getSalaryStructure>>;
  checklist: RowDataPacket[];
}

/** The employee's own record, without the portal-account columns. */
export async function getMyProfile(employeeId: number): Promise<MyProfile | null> {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;

  const [stats, salaryStructure, checklist] = await Promise.all([
    repo.getEmployeeStats(employeeId),
    repo.getSalaryStructure(employeeId),
    repo.listChecklist(employeeId),
  ]);

  return {
    employee: withoutAccountColumns(employee as unknown as Record<string, unknown>),
    stats,
    salaryStructure,
    checklist,
  };
}

export interface SelfServiceUpdateResult {
  employee: Record<string, unknown>;
  changedFields: string[];
}

/**
 * Applies the caller's own correction. Only the keys present in the body are
 * touched — an absent field is not an empty one — and an explicit `null` or
 * empty string clears a value the employee no longer has.
 */
export async function updateMyProfile(
  employeeId: number,
  input: unknown,
  actor: ActorContext
): Promise<SelfServiceUpdateResult | null> {
  const existing = await repo.findEmployeeById(employeeId);
  if (!existing) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    refuseFields([{ field: 'form', message: 'The update could not be read' }]);
  }

  const body = input as Record<string, unknown>;
  const refused = Object.keys(body).filter((key) => !(key in SELF_EDITABLE_FIELDS));
  if (refused.length) {
    refuseFields(
      refused.map((field) => ({
        field,
        message: `${field.replace(/_/g, ' ')} is maintained by your employer and cannot be changed here`,
      }))
    );
  }

  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  for (const [field, column] of Object.entries(SELF_EDITABLE_FIELDS)) {
    if (!(field in body)) continue;
    const raw = body[field];
    const next = typeof raw === 'string' ? raw.trim() : raw;
    if (canonical((existing as unknown as Record<string, unknown>)[column]) === canonical(next)) continue;

    if (field === 'email' && typeof next === 'string' && next && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      refuseFields([{ field, message: 'Enter a valid email address' }]);
    }
    if (field === 'pincode' && next !== null && next !== '' && !/^\d{4,8}$/.test(String(next))) {
      refuseFields([{ field, message: 'Enter a valid PIN code' }]);
    }
    if (field === 'ifsc_code' && next !== null && next !== '' && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(next))) {
      refuseFields([{ field, message: 'Enter a valid IFSC code, for example HDFC0001234' }]);
    }

    patch[column] = next === '' ? null : next;
    changedFields.push(column);
  }

  if (!changedFields.length) {
    return { employee: withoutAccountColumns(existing as unknown as Record<string, unknown>), changedFields };
  }

  await repo.updateEmployee(employeeId, patch, actor.user.id);

  const oldValues: Record<string, unknown> = {};
  for (const column of changedFields) oldValues[column] = (existing as unknown as Record<string, unknown>)[column] ?? null;

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: Number(existing.employer_id) || null,
    action: 'updated',
    module: 'employee',
    entityType: 'employee',
    entityId: employeeId,
    entityLabel: String(existing.name ?? ''),
    description: `${existing.name} updated their own details (${changedFields.join(', ')})`,
    oldValues,
    newValues: patch,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  const updated = await repo.findEmployeeById(employeeId);
  return {
    employee: withoutAccountColumns((updated ?? existing) as unknown as Record<string, unknown>),
    changedFields,
  };
}

/** The employee's own documents, joined to the vault so the screen can link them. */
export async function listMyDocuments(employeeId: number) {
  return repo.listDocuments(employeeId);
}

export interface MyDocumentResult {
  documentId: number;
  fileId: number;
  downloadUrl: string;
}

/**
 * Files a document against the caller's own record. The bytes either arrive with
 * the request or have already been uploaded to the vault, in which case the file
 * is claimed for this employee — a file that belongs to somebody else is refused
 * with a 403 rather than being re-pointed.
 */
export async function addMyDocument(
  employeeId: number,
  input: unknown,
  actor: ActorContext,
  upload?: { originalName: string; mimeType: string; data: Buffer } | null
): Promise<MyDocumentResult | null> {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;

  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const documentType = String(body.document_type ?? body.documentType ?? '').trim();
  const documentName = String(body.document_name ?? body.documentName ?? '').trim();

  const issues: { field: string; message: string }[] = [];
  if (!documentType) {
    issues.push({ field: 'document_type', message: 'Choose the kind of document' });
  } else if (!(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
    issues.push({ field: 'document_type', message: `Choose one of: ${DOCUMENT_TYPES.join(', ')}` });
  }
  if (documentName.length < 2) issues.push({ field: 'document_name', message: 'Document name is required' });
  if (!upload && !body.file_id && !body.fileId) issues.push({ field: 'file', message: 'Choose a file to upload' });
  if (issues.length) refuseFields(issues);

  let fileId: number;
  let storedName: string | null = null;
  let storedMime: string | null = null;
  let storedSize: number | null = null;

  if (upload) {
    const [saved] = await saveUploads(
      [upload],
      {
        entityType: 'EMPLOYEE',
        entityId: employeeId,
        category: documentType,
        // Personal documents are the employee's own and their employer's: a
        // private vault entry would hide the very file the checklist asks for.
        accessLevel: 'employer',
        description: documentName,
      },
      { user: actor.user, ip: actor.ip ?? null }
    );
    fileId = Number(saved.id);
    storedName = saved.original_name;
    storedMime = upload.mimeType || null;
    storedSize = upload.data.length;
  } else {
    const claimed = Number(body.file_id ?? body.fileId);
    const file = await findFile(claimed);
    if (!file) {
      return refuseFields([{ field: 'file_id', message: 'That file is not in the document vault' }]);
    }
    const ownedByAnother = file.entity_type === 'EMPLOYEE' && Number(file.entity_id) !== employeeId;
    if (ownedByAnother) {
      throw Object.assign(new Error('That file belongs to another employee and cannot be attached here'), {
        code: 'FORBIDDEN',
        status: 403,
      });
    }
    if (file.entity_type !== 'EMPLOYEE' || Number(file.entity_id) !== employeeId) {
      await query(
        `UPDATE files SET entity_type = 'EMPLOYEE', entity_id = ?, category = COALESCE(category, ?), updated_at = NOW()
          WHERE id = ?`,
        [employeeId, documentType, claimed]
      );
    }
    fileId = Number(file.id);
    storedName = file.original_name;
    storedMime = file.mime_type;
    storedSize = Number(file.size_bytes);
  }

  const documentId = await insert(
    `INSERT INTO employee_documents
       (employee_id, document_type, document_name, document_number, remarks, issue_date, expiry_date,
        file_id, file_path, file_size, mime_type, is_verified, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
    [
      employeeId,
      documentType,
      documentName,
      body.document_number ? String(body.document_number).trim() : null,
      body.remarks ? String(body.remarks).trim() : null,
      body.issue_date ? String(body.issue_date) : null,
      body.expiry_date ? String(body.expiry_date) : null,
      fileId,
      storedName,
      storedSize,
      storedMime,
      actor.user.id,
    ]
  );

  // The trail hangs off the document itself: the verification suite (and the
  // establishment) looks for rows whose module and entity agree on the document.
  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: Number(employee.employer_id) || null,
    action: 'created',
    module: 'employee_document',
    entityType: 'employee_document',
    entityId: documentId,
    entityLabel: documentName,
    description: `${employee.name} uploaded ${documentType} — ${documentName}`,
    newValues: { documentId, documentType, documentName, fileId },
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return { documentId, fileId, downloadUrl: `/api/files/${fileId}/download` };
}

export interface WithdrawResult {
  documentId: number;
  withdrawn: true;
}

/**
 * Withdraws one of the caller's own documents. A verified document is refused:
 * the employer's verification stands until the employer lifts it.
 */
export async function withdrawMyDocument(
  employeeId: number,
  documentId: number,
  actor: ActorContext
): Promise<WithdrawResult | null> {
  const document = await queryOne<RowDataPacket>(
    `SELECT ed.*, e.name AS employee_name, e.employer_id AS employer_id
       FROM employee_documents ed
       JOIN employees e ON e.id = ed.employee_id
      WHERE ed.id = ? AND ed.employee_id = ? AND ed.deleted_at IS NULL
      LIMIT 1`,
    [documentId, employeeId]
  );
  // Somebody else's document, or one already withdrawn, is simply not there.
  if (!document) return null;

  if (Number(document.is_verified) === 1) {
    throw Object.assign(
      new Error('This document has been verified by your employer and cannot be withdrawn. Ask your employer to return it first.'),
      { code: 'INVALID_STATE' }
    );
  }

  // `employee_documents` keeps no `updated_by` column: the who goes into the
  // activity log written below, and the row itself is only stamped withdrawn.
  await execute('UPDATE employee_documents SET deleted_at = NOW() WHERE id = ?', [documentId]);

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: Number(document.employer_id) || null,
    action: 'deleted',
    module: 'employee_document',
    entityType: 'employee_document',
    entityId: documentId,
    entityLabel: String(document.document_name ?? ''),
    description: `${document.employee_name} withdrew ${document.document_type} — ${document.document_name}`,
    oldValues: { documentId, documentType: document.document_type, documentName: document.document_name },
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return { documentId, withdrawn: true };
}

export interface MyServiceRecord {
  employee: Record<string, unknown>;
  records: RowDataPacket[];
  qualifications: RowDataPacket[];
  experience: RowDataPacket[];
  totalRecords: number;
}

/** The employee's own service record — a flat envelope, not a nested one. */
export async function getMyServiceRecord(employeeId: number): Promise<MyServiceRecord | null> {
  const employee = await repo.findEmployeeById(employeeId);
  if (!employee) return null;

  const [records, qualifications, experience] = await Promise.all([
    repo.listServiceRecords(employeeId),
    repo.listQualifications(employeeId),
    repo.listExperience(employeeId),
  ]);

  return {
    employee: withoutAccountColumns(employee as unknown as Record<string, unknown>),
    records,
    qualifications,
    experience,
    totalRecords: records.length,
  };
}

export type { Employee };
