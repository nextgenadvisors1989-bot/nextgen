/**
 * Auditor lifecycle: onboarding with an optional auditor-portal login, profile
 * maintenance, workload statistics, document vault attachments and the auditor
 * *type* register (safety, water, food safety, …).
 *
 * Every mutation writes an activity log entry; field changes also write an
 * audit-trail diff, because accreditation data is inspected during audits.
 */
import { randomUUID } from 'node:crypto';
import { execute, queryOne, query, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction } from '@/lib/db/transactions';
import { applyColumnDefaults } from '@/lib/db/column-defaults';
import * as repo from '@/repositories/auditor.repository';
import { auditorCreateSchema, auditorUpdateSchema, auditorTypeSchema } from '@/lib/validations/auditor.validation';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { createUserAccount } from '@/lib/auth/auth';
import { generateTemporaryPassword } from '@/lib/auth/password';
import { createActivationToken } from '@/lib/auth/activate';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { notifyMany, notifyUser, usersWithRole } from '@/lib/notifications/notification-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { APP_URL } from '@/lib/utils/constants';
import type { AuthUser } from '@/types/user';
import type { Auditor } from '@/types/auditor';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditorDetail {
  auditor: Auditor;
  stats: repo.AuditorStats;
  assignments: RowDataPacket[];
  clients: RowDataPacket[];
  documents: RowDataPacket[];
  login: { id: number; username: string; email: string; status: string; is_first_login: number; last_login_at: string | null } | null;
}

export interface CreateAuditorResult {
  auditorId: number;
  uuid: string;
  auditorCode: string;
  portalCredentials?: { username: string; temporaryPassword: string; email: string };
  warnings: string[];
}

export async function listAuditors(filters: repo.AuditorListFilters) {
  return repo.findAuditors(filters);
}

export async function getAuditorDetail(auditorId: number): Promise<AuditorDetail | null> {
  const auditor = await repo.findAuditorById(auditorId);
  if (!auditor) return null;

  const [stats, assignments, clients, documents, login] = await Promise.all([
    repo.getAuditorStats(auditorId),
    repo.listAuditorAssignments(auditorId),
    repo.listAuditorClients(auditorId),
    repo.listAuditorDocuments(auditorId),
    auditor.user_id
      ? queryOne<RowDataPacket>(
          'SELECT id, username, email, status, is_first_login, last_login_at FROM users WHERE id = ? LIMIT 1',
          [auditor.user_id]
        )
      : Promise.resolve(null),
  ]);

  return {
    auditor, stats, assignments, clients, documents,
    login: login ? (login as unknown as AuditorDetail['login']) : null,
  };
}

/**
 * Registers an auditor. The auditor code is generated as `AUDT/<year>/<serial>`
 * unless one is supplied, and an auditor-portal login can be provisioned in the
 * same transaction with the credentials emailed to the auditor.
 */
export async function createAuditor(input: unknown, actor: ActorContext): Promise<CreateAuditorResult> {
  const parsed = auditorCreateSchema.parse(input);
  const uuid = randomUUID();
  const warnings: string[] = [];

  const duplicateEmail = await repo.findAuditorByEmail(parsed.email);
  if (duplicateEmail) {
    throw Object.assign(new Error(`An auditor with the email ${parsed.email} already exists`), { code: 'ER_DUP_ENTRY' });
  }

  const auditorCode = await nextDocumentNumber('auditor');

  const {
    create_portal_user, portal_user_email, portal_user_name, portal_user_mobile,
    ...auditorFields
  } = parsed;

  const data: Record<string, unknown> = {
    ...auditorFields,
    uuid,
    auditor_code: auditorCode,
    // The portal password lives on `users`; the mirror columns stay null until a login exists.
    password_hash: null,
    is_first_login: 1,
  };
  delete data.create_portal_user;

  const auditorId = await repo.createAuditor(await applyColumnDefaults('auditors', data), actor.user.id);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'created', module: 'auditor', entityType: 'auditors', entityId: auditorId,
    entityLabel: `${parsed.name} (${auditorCode})`,
    description: `Auditor ${parsed.name} (${auditorCode}) registered`,
    newValues: { ...data, password_hash: undefined },
    ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  let portalCredentials: CreateAuditorResult['portalCredentials'];

  if (create_portal_user && portal_user_email) {
    const displayName = portal_user_name ?? parsed.name;
    const temporaryPassword = generateTemporaryPassword(12);
    const username = (portal_user_email.split('@')[0] ?? 'auditor').toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const [firstName, ...rest] = displayName.trim().split(/\s+/);

    try {
      const userId = await createUserAccount({
        email: portal_user_email,
        username,
        password: temporaryPassword,
        firstName,
        lastName: rest.join(' ') || '-',
        mobile: portal_user_mobile ?? parsed.mobile ?? null,
        roleSlugs: ['auditor'],
        createdBy: actor.user.id,
      });

      await execute('UPDATE auditors SET user_id = ?, username = ?, updated_by = ? WHERE id = ?', [
        userId, username, actor.user.id, auditorId,
      ]);

      const activationToken = await createActivationToken(userId, 72);
      const emailResult = await sendTemplateEmail({
        to: portal_user_email,
        templateCode: 'welcome.credentials',
        data: {
          recipient_name: displayName,
          created_by_name: actor.user.fullName,
          username,
          temporary_password: temporaryPassword,
          role_name: 'Auditor',
          scope_label: 'Auditor Code',
          scope_value: auditorCode,
          login_url: `${APP_URL}/login`,
          activate_url: `${APP_URL}/activate-account?token=${activationToken}`,
        },
        entityType: 'auditor',
        entityId: auditorId,
        sentBy: actor.user.id,
      });

      if (!emailResult.ok) warnings.push(`Credentials email could not be sent: ${emailResult.error ?? 'unknown error'}`);
      portalCredentials = { username, temporaryPassword, email: portal_user_email };
    } catch (error) {
      warnings.push(`Auditor portal account could not be created: ${(error as Error).message}`);
    }
  }

  for (const adminUserId of await usersWithRole('admin')) {
    await notifyUser({
      userId: adminUserId,
      title: 'New auditor onboarded',
      message: `${parsed.name} (${auditorCode}) was added by ${actor.user.fullName}.`,
      type: 'success',
      category: 'ACCOUNT',
      actionUrl: `/admin/auditors/${auditorId}`,
      actionLabel: 'View Auditor',
      entityType: 'auditor',
      entityId: auditorId,
      channels: ['in_app'],
    });
  }

  return { auditorId, uuid, auditorCode, portalCredentials, warnings };
}

export async function updateAuditor(auditorId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findAuditorById(auditorId);
  if (!existing) return null;

  const parsed = auditorUpdateSchema.parse(input);
  const {
    create_portal_user, portal_user_email, portal_user_name, portal_user_mobile,
    ...scalarInput
  } = parsed;

  // Portal logins are provisioned at creation; this screen never rewrites them.
  void create_portal_user; void portal_user_email; void portal_user_name; void portal_user_mobile;

  const data = Object.fromEntries(Object.entries(scalarInput).filter(([, value]) => value !== undefined));

  if (typeof data.email === 'string' && data.email !== existing.email) {
    if (await repo.findAuditorByEmail(data.email, auditorId)) {
      throw Object.assign(new Error('Another auditor already uses this email address'), { code: 'ER_DUP_ENTRY' });
    }
  }
  if (typeof data.aadhaar_number === 'string' && data.aadhaar_number && data.aadhaar_number !== existing.aadhaar_number) {
    const clash = await queryOne<{ id: number } & RowDataPacket>(
      'SELECT id FROM auditors WHERE aadhaar_number = ? AND id <> ? AND deleted_at IS NULL LIMIT 1',
      [data.aadhaar_number, auditorId]
    );
    if (clash) {
      throw Object.assign(new Error('Another auditor already uses this Aadhaar number'), { code: 'ER_DUP_ENTRY' });
    }
  }

  const record = await applyColumnDefaults('auditors', data);
  const changed = await repo.updateAuditor(auditorId, record, actor.user.id);

  if (changed) {
    await writeAuditTrail({
      tableName: 'auditors',
      recordId: auditorId,
      operation: 'UPDATE',
      changes: Object.fromEntries(
        Object.keys(record).map((field) => [
          field,
          { from: (existing as unknown as Record<string, unknown>)[field] ?? null, to: record[field] ?? null },
        ])
      ),
      changedBy: actor.user.id,
      changedByName: actor.user.fullName,
      ipAddress: actor.ip ?? null,
    });

    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      action: 'updated', module: 'auditor', entityType: 'auditors', entityId: auditorId,
      entityLabel: `${data.name ?? existing.name} (${existing.auditor_code})`,
      description: `Auditor ${data.name ?? existing.name} updated`,
      newValues: record, ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
    });
  }

  return { updated: changed, auditor: await repo.findAuditorById(auditorId) };
}

export interface DeleteAuditorResult {
  deleted: boolean;
  portalDisabled: boolean;
  reason?: string;
}

/**
 * Soft-deletes an auditor. Refused while open assignments exist — reassigning an
 * audit is an explicit admin action, not a side effect of deleting a profile.
 */
export async function deleteAuditor(auditorId: number, actor: ActorContext): Promise<DeleteAuditorResult | null> {
  const existing = await repo.findAuditorById(auditorId);
  if (!existing) return null;

  const open = await queryOne<{ total: number } & RowDataPacket>(
    `SELECT COUNT(*) AS total FROM audit_assignments
      WHERE auditor_id = ? AND deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')`,
    [auditorId]
  );
  const openCount = Number(open?.total ?? 0);
  if (openCount > 0) {
    return { deleted: false, portalDisabled: false, reason: `${openCount} open assignment(s) must be reassigned or cancelled first` };
  }

  let portalDisabled = false;
  await withTransaction(async (tx) => {
    await tx.execute('UPDATE auditors SET deleted_at = NOW(), status = ?, updated_by = ? WHERE id = ?', ['inactive', actor.user.id, auditorId]);
    if (existing.user_id) {
      await tx.execute("UPDATE users SET status = 'inactive', updated_by = ? WHERE id = ?", [actor.user.id, existing.user_id]);
      portalDisabled = true;
    }
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'deleted', module: 'auditor', entityType: 'auditors', entityId: auditorId,
    entityLabel: `${existing.name} (${existing.auditor_code})`,
    description: `Auditor ${existing.name} archived${portalDisabled ? ' and their portal login deactivated' : ''}`,
    oldValues: { name: existing.name, status: existing.status, email: existing.email },
    ipAddress: actor.ip ?? null,
  });

  return { deleted: true, portalDisabled };
}

/** Re-activates an archived auditor (and their portal login when one exists). */
export async function restoreAuditor(auditorId: number, actor: ActorContext) {
  const row = await queryOne<{ id: number; name: string; user_id: number | null } & RowDataPacket>(
    'SELECT id, name, user_id FROM auditors WHERE id = ? LIMIT 1',
    [auditorId]
  );
  if (!row) return null;

  await withTransaction(async (tx) => {
    await tx.execute('UPDATE auditors SET deleted_at = NULL, status = ?, updated_by = ? WHERE id = ?', ['active', actor.user.id, auditorId]);
    if (row.user_id) {
      await tx.execute("UPDATE users SET status = 'active', updated_by = ? WHERE id = ?", [actor.user.id, row.user_id]);
    }
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'restored', module: 'auditor', entityType: 'auditors', entityId: auditorId,
    entityLabel: row.name, description: `Auditor ${row.name} restored`,
    ipAddress: actor.ip ?? null,
  });

  return { restored: true };
}

/**
 * Grants (or resets) an auditor-portal login for an existing auditor record.
 * Returns the credentials so the admin can hand them over; the email carries the
 * activation link as well.
 */
export async function provisionAuditorLogin(auditorId: number, actor: ActorContext) {
  const auditor = await repo.findAuditorById(auditorId);
  if (!auditor) return null;

  if (auditor.user_id) {
    const existingLogin = await queryOne<{ id: number; status: string } & RowDataPacket>(
      'SELECT id, status FROM users WHERE id = ? LIMIT 1',
      [auditor.user_id]
    );
    if (existingLogin && existingLogin.status === 'active') {
      throw Object.assign(new Error('This auditor already has an active portal login'), { code: 'ALREADY_EXISTS' });
    }
  }

  const temporaryPassword = generateTemporaryPassword(12);
  const username = (auditor.email.split('@')[0] ?? 'auditor').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const [firstName, ...rest] = auditor.name.trim().split(/\s+/);

  const userId = await createUserAccount({
    email: auditor.email,
    username,
    password: temporaryPassword,
    firstName,
    lastName: rest.join(' ') || '-',
    mobile: auditor.mobile ?? null,
    roleSlugs: ['auditor'],
    createdBy: actor.user.id,
  });

  await execute('UPDATE auditors SET user_id = ?, username = ?, status = ?, updated_by = ? WHERE id = ?', [
    userId, username, 'active', actor.user.id, auditorId,
  ]);

  const activationToken = await createActivationToken(userId, 72);
  const emailResult = await sendTemplateEmail({
    to: auditor.email,
    templateCode: 'welcome.credentials',
    data: {
      recipient_name: auditor.name,
      created_by_name: actor.user.fullName,
      username,
      temporary_password: temporaryPassword,
      role_name: 'Auditor',
      scope_label: 'Auditor Code',
      scope_value: auditor.auditor_code,
      login_url: `${APP_URL}/login`,
      activate_url: `${APP_URL}/activate-account?token=${activationToken}`,
    },
    entityType: 'auditor',
    entityId: auditorId,
    sentBy: actor.user.id,
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'created', module: 'auditor', entityType: 'auditors', entityId: auditorId,
    entityLabel: `${auditor.name} (${auditor.auditor_code})`,
    description: `Auditor portal login provisioned for ${auditor.name}`,
    newValues: { username, user_id: userId },
    ipAddress: actor.ip ?? null,
  });

  return {
    credentials: { username, temporaryPassword, email: auditor.email },
    emailSent: emailResult.ok,
    warning: emailResult.ok ? undefined : `Credentials email could not be sent: ${emailResult.error ?? 'unknown error'}`,
  };
}

/** Assigns (or clears) the auditor's performance rating, 0–5. */
export async function rateAuditor(auditorId: number, rating: number, actor: ActorContext) {
  const existing = await repo.findAuditorById(auditorId);
  if (!existing) return null;

  await execute('UPDATE auditors SET rating = ?, updated_by = ? WHERE id = ?', [rating, actor.user.id, auditorId]);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'updated', module: 'auditor', entityType: 'auditors', entityId: auditorId,
    entityLabel: `${existing.name} (${existing.auditor_code})`,
    description: `Auditor rating set to ${rating}/5`,
    oldValues: { rating: existing.rating }, newValues: { rating },
    ipAddress: actor.ip ?? null,
  });

  return { rating };
}

export function auditorOptions(search?: string, limit?: number) {
  return repo.auditorOptions(search, limit);
}

/** Options plus the lookups the create/edit form needs in one call. */
export async function auditorLookups() {
  const [types, employers] = await Promise.all([
    repo.findAuditorTypes({ status: 'active' }),
    query<RowDataPacket>(
      "SELECT id, company_name, employer_code FROM employers WHERE deleted_at IS NULL AND status = 'active' ORDER BY company_name ASC"
    ),
  ]);
  return {
    auditorTypes: types.map((type) => ({
      id: Number(type.id),
      name: String(type.name),
      code: String(type.code),
      specialization: type.specialization ?? null,
    })),
    employers: employers.map((row) => ({
      id: Number(row.id),
      company_name: String(row.company_name),
      employer_code: String(row.employer_code),
    })),
  };
}

/* -------------------------------------------------------------- auditor types */

export async function listAuditorTypes(filters: { search?: string; status?: string } = {}) {
  return repo.findAuditorTypes(filters);
}

export async function createAuditorType(input: unknown, actor: ActorContext) {
  const parsed = auditorTypeSchema.parse(input);
  if (await repo.findAuditorTypeByCode(parsed.code)) {
    throw Object.assign(new Error(`Auditor type code ${parsed.code} is already in use`), { code: 'ER_DUP_ENTRY' });
  }

  const id = await repo.createAuditorType(parsed as unknown as Record<string, unknown>);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'created', module: 'auditor_type', entityType: 'auditor_types', entityId: id,
    entityLabel: `${parsed.name} (${parsed.code})`,
    description: `Auditor type ${parsed.name} created`, newValues: parsed as unknown as Record<string, unknown>,
    ipAddress: actor.ip ?? null,
  });
  return { auditorTypeId: id };
}

export async function updateAuditorType(auditorTypeId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findAuditorTypeById(auditorTypeId);
  if (!existing) return null;

  const parsed = auditorTypeSchema.partial().parse(input);
  const data = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));

  if (typeof data.code === 'string' && data.code !== existing.code) {
    if (await repo.findAuditorTypeByCode(data.code, auditorTypeId)) {
      throw Object.assign(new Error(`Auditor type code ${data.code} is already in use`), { code: 'ER_DUP_ENTRY' });
    }
  }

  const updated = await repo.updateAuditorType(auditorTypeId, data);
  if (updated) {
    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      action: 'updated', module: 'auditor_type', entityType: 'auditor_types', entityId: auditorTypeId,
      entityLabel: `${data.name ?? existing.name}`,
      description: `Auditor type ${data.name ?? existing.name} updated`,
      newValues: data, ipAddress: actor.ip ?? null,
    });
  }
  return { updated };
}

export async function deleteAuditorType(auditorTypeId: number, actor: ActorContext) {
  const existing = await repo.findAuditorTypeById(auditorTypeId);
  if (!existing) return null;

  const inUse = await queryOne<{ total: number } & RowDataPacket>(
    'SELECT COUNT(*) AS total FROM auditors WHERE auditor_type_id = ? AND deleted_at IS NULL',
    [auditorTypeId]
  );
  const count = Number(inUse?.total ?? 0);
  if (count > 0) {
    return { deleted: false, reason: `${count} auditor(s) are still registered under this type` };
  }

  await repo.softDeleteAuditorType(auditorTypeId);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'deleted', module: 'auditor_type', entityType: 'auditor_types', entityId: auditorTypeId,
    entityLabel: `${existing.name} (${existing.code})`,
    description: `Auditor type ${existing.name} archived`,
    oldValues: { name: existing.name, code: existing.code, status: existing.status },
    ipAddress: actor.ip ?? null,
  });
  return { deleted: true };
}

/** Notifies auditors and verifiers when an assignment is raised against them. */
export async function notifyAuditStakeholders(input: {
  auditorUserId: number | null;
  verifierUserId: number | null;
  title: string;
  message: string;
  actionUrl: string;
  entityId: number;
}) {
  const userIds = [input.auditorUserId, input.verifierUserId].filter((id): id is number => Boolean(id));
  if (!userIds.length) return;
  await notifyMany(userIds, {
    title: input.title,
    message: input.message,
    type: 'info',
    category: 'AUDIT',
    actionUrl: input.actionUrl,
    actionLabel: 'Open Assignment',
    entityType: 'audit_assignment',
    entityId: input.entityId,
    channels: ['in_app', 'email'],
  });
}
