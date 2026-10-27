/**
 * Users, roles and permissions service.
 *
 * Owns the access model end to end: creating a login (with generated
 * credentials, an activation link and the credential email), the user lifecycle
 * (status, unlock, password reset, sessions, archive/restore), role CRUD with
 * the system-role guard rails, and the permission matrix that writes the whole
 * desired grant set for a role in one transaction.
 *
 * Every mutation is written to the activity log, and role/permission changes are
 * also written to the field-level audit trail — "who gave this role
 * `payroll.export` and when" is a question this module must be able to answer.
 */
import { randomUUID } from 'node:crypto';
import { execute, insert, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { hashPassword, generateTemporaryPassword, generateUsername, validatePasswordStrength } from '@/lib/auth/password';
import { createActivationToken } from '@/lib/auth/activate';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { ROLE_DEFINITIONS, grantsForRole, permissionName } from '@/lib/auth/rbac';
import {
  archiveRole, archiveUser, existingUsernames, findRoleById, findRoleBySlug, findRoles,
  findRolesBySlugs, findUserById, findUsers, linkAuditor, linkEmployee, linkEmployer,
  liveSessions, matrixRoles, permissionCatalogue, permissionNamesExist, pendingActivations,
  portalLinkCandidates, restoreUser, revokeUserSessions, roleMembers, rolePermissionNames,
  roleSlugExists, roleStats, roleUserCount, setPassword, setRolePermissions, setUserRoles,
  unlockUser, updateRole, updateUser, upsertRole, userActivitySummary, userLinks,
  userPermissions, userRoles, usersByRole, userSessions, userStats, usernameExists,
  userEmailExists, allRolePermissionPairs,
} from '@/repositories/user.repository';
import { APP_URL } from '@/lib/utils/constants';
import type { AuthUser } from '@/types/user';
import type {
  RoleListQuery, UserListQuery,
} from '@/lib/validations/user.validation';

type ServiceError = Error & { code: string; details?: Record<string, unknown> };

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { code, details }) as ServiceError;
}

function actorOf(actor: { user: AuthUser; ip?: string | null }) {
  return {
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId,
    ipAddress: actor.ip ?? null,
  };
}

const ROLE_LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  ROLE_DEFINITIONS.map((role) => [role.slug, role.name])
);

/* ───────────────────────────────── users ───────────────────────────────── */

export async function listUsers(filters: UserListQuery & { includeDeleted?: boolean }) {
  const [result, stats, byRole, pending, sessions] = await Promise.all([
    findUsers(filters),
    userStats(),
    usersByRole(),
    pendingActivations(),
    liveSessions(),
  ]);

  return {
    ...result,
    stats,
    byRole: (byRole as RowDataPacket[]).map((row) => ({
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      isSystemRole: Boolean(Number(row.is_system_role)),
      users: Number(row.total),
      permissions: Number(row.permissions),
    })),
    pendingActivation: pending,
    sessions,
  };
}

export async function getUserDetail(userId: number) {
  const user = await findUserById(userId);
  if (!user) fail('NOT_FOUND', 'That user account does not exist');

  const [roles, permissions, sessions, links, activity, candidates] = await Promise.all([
    userRoles(userId),
    userPermissions(userId),
    userSessions(userId),
    userLinks(userId),
    userActivitySummary(userId),
    portalLinkCandidates(),
  ]);

  return { user, roles, permissions, sessions, links, activity, candidates };
}

export async function createUser(
  input: {
    first_name: string;
    last_name: string;
    email: string;
    username?: string;
    mobile?: string | null;
    role_slugs: string[];
    status?: 'active' | 'inactive' | 'suspended';
    send_credentials?: boolean;
    password?: string | null;
    employer_id?: number | null;
    auditor_id?: number | null;
    employee_id?: number | null;
  },
  actor: { user: AuthUser; ip?: string | null }
) {
  const email = input.email.toLowerCase();
  if (await userEmailExists(email)) fail('DUPLICATE', `${email} is already registered`);

  const roles = await findRolesBySlugs(input.role_slugs);
  if (roles.length !== input.role_slugs.length) {
    const known = new Set(roles.map((role) => String(role.slug)));
    const missing = input.role_slugs.filter((slug) => !known.has(slug));
    fail('INVALID_REFERENCE', `Unknown role(s): ${missing.join(', ')}`, { issues: [{ field: 'role_slugs', message: 'Unknown role' }] });
  }

  const fullName = `${input.first_name} ${input.last_name}`.trim();
  const username = (input.username ?? generateUsername(fullName, await existingUsernames())).toLowerCase();
  if (await usernameExists(username)) fail('DUPLICATE', `The username ${username} is already taken`);

  // Either the administrator supplies a password, or the platform generates one
  // and emails it with an activation link (the default).
  const usingGeneratedPassword = !input.password;
  if (input.password) {
    const strength = validatePasswordStrength(input.password);
    if (!strength.valid) {
      fail('VALIDATION_FAILED', strength.errors[0] ?? 'Password does not meet policy', {
        issues: strength.errors.map((message: string) => ({ field: 'password', message })),
      });
    }
  }
  const temporaryPassword = input.password ?? generateTemporaryPassword(12);
  const passwordHash = await hashPassword(temporaryPassword);

  const status = input.status ?? 'active';
  const userId = await insert(
    `INSERT INTO users (uuid, email, username, password_hash, first_name, last_name, mobile, status,
                        is_first_login, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      randomUUID(), email, username, passwordHash, input.first_name.trim(), input.last_name.trim(),
      input.mobile ?? null, status, actor.user.id, actor.user.id,
    ]
  );

  await setUserRoles(userId, roles.map((role) => Number(role.id)), actor.user.id);

  // Portal bindings: an employer login joins the company's portal users, while an
  // auditor/employee login is stored on the record itself.
  const linked: string[] = [];
  if (input.employer_id) { await linkEmployer(userId, Number(input.employer_id)); linked.push(`employer #${input.employer_id}`); }
  if (input.auditor_id) { await linkAuditor(userId, Number(input.auditor_id)); linked.push(`auditor #${input.auditor_id}`); }
  if (input.employee_id) { await linkEmployee(userId, Number(input.employee_id)); linked.push(`employee #${input.employee_id}`); }

  const roleNames = roles.map((role) => String(role.name)).join(', ');
  let activation: { sent: boolean; emailed: boolean; provider?: string; message: string } = { sent: false, emailed: false, message: 'No email requested' };

  if (input.send_credentials !== false) {
    const token = await createActivationToken(userId, 72);
    const emailResult = await sendTemplateEmail({
      to: email,
      templateCode: 'welcome.credentials',
      data: {
        recipient_name: fullName,
        created_by_name: actor.user.fullName,
        username,
        temporary_password: temporaryPassword,
        role_name: roleNames,
        scope_label: linked.length ? 'Linked record' : 'Portal',
        scope_value: linked.length ? linked.join(', ') : 'ComplianceOS',
        activate_url: `${APP_URL}/activate-account?token=${token}`,
      },
      entityType: 'user',
      entityId: userId,
      sentBy: actor.user.id,
    });
    activation = {
      sent: true,
      emailed: Boolean(emailResult.ok),
      provider: emailResult.provider,
      message: 'Credentials emailed with a 72-hour activation link',
    };
  }

  await writeActivityLog({
    ...actorOf(actor),
    action: 'created',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: fullName,
    description: `User account ${email} created with role(s) ${roleNames}${linked.length ? `, linked to ${linked.join(', ')}` : ''}`,
    newValues: { email, username, roles: input.role_slugs, status, linked },
  });

  await writeAuditTrail({
    tableName: 'users',
    recordId: userId,
    operation: 'INSERT',
    changes: {
      email: { from: null, to: email },
      username: { from: null, to: username },
      roles: { from: null, to: input.role_slugs.join(', ') },
      status: { from: null, to: status },
    },
    changedBy: actor.user.id,
    changedByName: actor.user.fullName,
    ipAddress: actor.ip ?? null,
  });

  return {
    userId,
    name: fullName,
    email,
    username,
    roleNames,
    status,
    // Returned once so the administrator can hand them over in person; the same
    // values went out by email and are never retrievable again.
    credentials: { username, temporaryPassword, email },
    activation,
    usingGeneratedPassword,
    linked,
  };
}

export async function updateUserRecord(
  userId: number,
  input: {
    first_name?: string;
    last_name?: string;
    email?: string;
    username?: string;
    mobile?: string | null;
    status?: 'active' | 'inactive' | 'suspended';
    profile_photo?: string | null;
  },
  actor: { user: AuthUser; ip?: string | null }
) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (existing.deleted_at) fail('INVALID_STATE', 'That account is archived — restore it before editing');

  if (input.email && input.email.toLowerCase() !== String(existing.email)) {
    if (await userEmailExists(input.email, userId)) fail('DUPLICATE', `${input.email} is already registered`);
  }
  if (input.username && input.username.toLowerCase() !== String(existing.username)) {
    if (await usernameExists(input.username, userId)) fail('DUPLICATE', `The username ${input.username} is already taken`);
  }
  if (input.status && Number(existing.id) === actor.user.id && input.status !== 'active') {
    fail('INVALID_STATE', 'You cannot deactivate the account you are signed in with');
  }

  const changes: Record<string, string | null> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const set = (column: string, value: string | null) => {
    changes[column] = value;
    before[column] = (existing as unknown as Record<string, unknown>)[column] ?? null;
    after[column] = value;
  };

  if (input.first_name !== undefined) set('first_name', input.first_name.trim());
  if (input.last_name !== undefined) set('last_name', input.last_name.trim());
  if (input.email !== undefined) set('email', input.email.toLowerCase());
  if (input.username !== undefined) set('username', input.username.toLowerCase());
  if (input.mobile !== undefined) set('mobile', input.mobile);
  if (input.status !== undefined) set('status', input.status);
  if (input.profile_photo !== undefined) set('profile_photo', input.profile_photo);

  if (!Object.keys(changes).length) fail('NO_CHANGE', 'Change at least one field before saving');

  await updateUser(userId, changes, actor.user.id);

  // Deactivating or suspending a login must end its sessions immediately.
  if (input.status && input.status !== 'active') {
    await revokeUserSessions(userId);
  }

  const description = `User ${existing.email} updated`;
  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${changes.first_name ?? existing.first_name} ${changes.last_name ?? existing.last_name}`.trim(),
    description: input.status && input.status !== existing.status
      ? `${description} — status ${existing.status} → ${input.status}`
      : description,
    oldValues: before,
    newValues: after,
  });

  await writeAuditTrail({
    tableName: 'users',
    recordId: userId,
    operation: 'UPDATE',
    changes: Object.fromEntries(
      Object.keys(changes).map((column) => [column, { from: before[column], to: after[column] }])
    ),
    changedBy: actor.user.id,
    changedByName: actor.user.fullName,
    ipAddress: actor.ip ?? null,
  });

  return { userId, name: `${changes.first_name ?? existing.first_name} ${changes.last_name ?? existing.last_name}`.trim() };
}

export async function setUserRoleAssignment(
  userId: number,
  roleSlugs: string[],
  reason: string | null,
  actor: { user: AuthUser; ip?: string | null }
) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (existing.deleted_at) fail('INVALID_STATE', 'That account is archived — restore it before changing roles');

  const roles = await findRolesBySlugs(roleSlugs);
  if (roles.length !== roleSlugs.length) {
    const known = new Set(roles.map((role) => String(role.slug)));
    fail('INVALID_REFERENCE', `Unknown role(s): ${roleSlugs.filter((slug) => !known.has(slug)).join(', ')}`);
  }

  const previous = String(existing.role_slugs ?? '').split('|').filter(Boolean);
  // Losing an administrator role while being the only administrator would lock
  // the platform out of its own administration.
  if (previous.includes('super_admin') && !roleSlugs.includes('super_admin')) {
    const others = await queryOne<RowDataPacket>(
      `SELECT COUNT(*) AS total FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE r.slug = 'super_admin' AND ur.user_id <> ?`,
      [userId]
    );
    if (Number(others?.total ?? 0) === 0) {
      fail('INVALID_STATE', 'This is the only super administrator — grant the role to somebody else first');
    }
  }
  if (Number(existing.id) === actor.user.id && !roleSlugs.includes('super_admin') && previous.includes('super_admin')) {
    fail('INVALID_STATE', 'You cannot remove your own super administrator role');
  }

  await setUserRoles(userId, roles.map((role) => Number(role.id)), actor.user.id);

  // A role change alters what the session is allowed to do, so the old sessions
  // must not keep the previous grants alive.
  await revokeUserSessions(userId);

  await writeActivityLog({
    ...actorOf(actor),
    action: 'assigned',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `Roles for ${existing.email} changed to ${roleSlugs.join(', ')}${reason ? ` — ${reason}` : ''}`,
    oldValues: { roles: previous.join(', ') },
    newValues: { roles: roleSlugs.join(', ') },
  });

  await writeAuditTrail({
    tableName: 'user_roles',
    recordId: userId,
    operation: 'UPDATE',
    changes: { roles: { from: previous.join(', '), to: roleSlugs.join(', ') } },
    changedBy: actor.user.id,
    changedByName: actor.user.fullName,
    ipAddress: actor.ip ?? null,
    reason,
  });

  return {
    userId,
    roles: roles.map((role) => ({ slug: String(role.slug), name: String(role.name) })),
    sessionsRevoked: true,
  };
}

/** Emails a password-reset link. Mirrors the self-service flow, admin-initiated. */
export async function sendUserPasswordReset(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (existing.deleted_at) fail('INVALID_STATE', 'That account is archived');

  const { createPasswordResetToken } = await import('@/lib/auth/auth');
  const issued = await createPasswordResetToken(String(existing.email), actor.ip ?? null);
  if (!issued) fail('INVALID_STATE', 'Reset links can only be issued to active accounts');

  await sendTemplateEmail({
    to: String(existing.email),
    templateCode: 'auth.password_reset',
    data: {
      recipient_name: `${existing.first_name} ${existing.last_name}`.trim(),
      email: existing.email,
      reset_url: `${APP_URL}/reset-password?token=${issued.token}`,
      ip_address: actor.ip ?? '—',
      requested_at: new Date().toISOString(),
      requested_by: actor.user.fullName,
    },
    entityType: 'user',
    entityId: userId,
    sentBy: actor.user.id,
  });

  await writeActivityLog({
    ...actorOf(actor),
    action: 'password_reset',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `Password reset link emailed to ${existing.email} by ${actor.user.fullName}`,
  });

  return { userId, emailedTo: String(existing.email), expiresIn: '1 hour' };
}

/** Re-sends the credential email with a fresh activation link and password. */
export async function resendUserActivation(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (existing.deleted_at) fail('INVALID_STATE', 'That account is archived');

  const temporaryPassword = generateTemporaryPassword(12);
  await setPassword(userId, await hashPassword(temporaryPassword), true);
  const token = await createActivationToken(userId, 72);

  await sendTemplateEmail({
    to: String(existing.email),
    templateCode: 'welcome.credentials',
    data: {
      recipient_name: `${existing.first_name} ${existing.last_name}`.trim(),
      created_by_name: actor.user.fullName,
      username: existing.username,
      temporary_password: temporaryPassword,
      role_name: String(existing.role_names ?? ''),
      scope_label: 'Resent',
      scope_value: 'Activation link re-issued',
      activate_url: `${APP_URL}/activate-account?token=${token}`,
    },
    entityType: 'user',
    entityId: userId,
    sentBy: actor.user.id,
  });

  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `Activation credentials re-sent to ${existing.email}; previous sessions revoked`,
  });

  return {
    userId,
    emailedTo: String(existing.email),
    credentials: { username: String(existing.username), temporaryPassword },
    expiresIn: '72 hours',
  };
}

export async function unlockUserAccount(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (!existing.is_locked) fail('NO_CHANGE', 'That account is not locked');

  await unlockUser(userId);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `Account lock cleared for ${existing.email} (was locked until ${existing.locked_until})`,
    oldValues: { locked_until: existing.locked_until, failed_login_count: existing.failed_login_count },
    newValues: { locked_until: null, failed_login_count: 0 },
  });
  return { userId, unlocked: true };
}

export async function revokeSessionsForUser(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');

  const revoked = await revokeUserSessions(userId);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `${revoked} active session(s) revoked for ${existing.email}`,
  });
  return { userId, revoked };
}

export async function archiveUserAccount(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (existing.deleted_at) fail('INVALID_STATE', 'That account is already archived');
  if (Number(existing.id) === actor.user.id) fail('INVALID_STATE', 'You cannot archive the account you are signed in with');

  if (String(existing.role_slugs ?? '').includes('super_admin')) {
    const others = await queryOne<RowDataPacket>(
      `SELECT COUNT(*) AS total FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE r.slug = 'super_admin' AND ur.user_id <> ?`,
      [userId]
    );
    if (Number(others?.total ?? 0) === 0) {
      fail('INVALID_STATE', 'This is the only super administrator — the platform would lose its administration');
    }
  }

  await archiveUser(userId, actor.user.id);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'archived',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `User account ${existing.email} archived; every active session was revoked`,
    oldValues: { status: existing.status, deleted_at: null },
    newValues: { status: 'inactive', deleted_at: new Date().toISOString() },
  });
  return { userId, archived: true };
}

export async function restoreUserAccount(userId: number, actor: { user: AuthUser; ip?: string | null }) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');
  if (!existing.deleted_at) fail('INVALID_STATE', 'That account is not archived');
  if (await userEmailExists(String(existing.email), userId)) {
    fail('DUPLICATE', `${existing.email} has been re-registered since — rename one of the two accounts`);
  }

  await restoreUser(userId, actor.user.id);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'restored',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `User account ${existing.email} restored (status active, lock cleared)`,
  });
  return { userId, restored: true };
}

/** Portal linking from the detail screen (bind a login to a record). */
export async function linkUserToPortal(
  userId: number,
  input: { employer_id?: number; auditor_id?: number; employee_id?: number },
  actor: { user: AuthUser; ip?: string | null }
) {
  const existing = await findUserById(userId);
  if (!existing) fail('NOT_FOUND', 'That user account does not exist');

  const linked: string[] = [];
  if (input.employer_id) { await linkEmployer(userId, input.employer_id); linked.push(`employer #${input.employer_id}`); }
  if (input.auditor_id) { await linkAuditor(userId, input.auditor_id); linked.push(`auditor #${input.auditor_id}`); }
  if (input.employee_id) { await linkEmployee(userId, input.employee_id); linked.push(`employee #${input.employee_id}`); }
  if (!linked.length) fail('VALIDATION_FAILED', 'Choose an employer, auditor or employee record to link');

  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'user',
    entityType: 'users',
    entityId: userId,
    entityLabel: `${existing.first_name} ${existing.last_name}`.trim(),
    description: `${existing.email} linked to ${linked.join(', ')}`,
  });
  return { userId, linked };
}

/* ───────────────────────────────── roles ───────────────────────────────── */

export async function listRoles(filters: RoleListQuery) {
  const [result, stats, matrix] = await Promise.all([findRoles(filters), roleStats(), matrixRoles()]);
  return {
    ...result,
    stats,
    matrixRoles: (matrix as RowDataPacket[]).map((row) => ({
      slug: String(row.slug),
      name: String(row.name),
      users: Number(row.users),
      permissions: Number(row.permissions),
      isSystemRole: Boolean(Number(row.is_system_role)),
    })),
  };
}

export async function getRoleDetail(roleId: number) {
  const role = await findRoleById(roleId);
  if (!role) fail('NOT_FOUND', 'That role does not exist');

  const [permissions, members, catalogue] = await Promise.all([
    rolePermissionNames(roleId),
    roleMembers(roleId),
    permissionCatalogue(),
  ]);

  return {
    role,
    permissionNames: (permissions as RowDataPacket[]).map((row) => String(row.name)),
    members,
    catalogue,
  };
}

function slugifyRole(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 50);
}

export async function createRoleRecord(
  input: { name: string; slug?: string; description?: string | null; permissions?: string[]; clone_from?: string | null },
  actor: { user: AuthUser; ip?: string | null }
) {
  const slug = (input.slug ?? slugifyRole(input.name)).toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    fail('VALIDATION_FAILED', 'The slug must start with a letter and use lowercase letters, numbers and underscores only');
  }
  if (await roleSlugExists(slug)) fail('DUPLICATE', `The role slug ${slug} is already in use`);

  let permissions = input.permissions ?? [];
  if (input.clone_from) {
    const source = await findRoleBySlug(input.clone_from);
    if (!source) fail('INVALID_REFERENCE', `Cannot clone: role ${input.clone_from} does not exist`);
    const sourcePermissions = (await rolePermissionNames(Number(source.id))).map((row) => String(row.name));
    permissions = [...new Set([...sourcePermissions, ...permissions])];
  }

  if (permissions.length) {
    const valid = await permissionNamesExist(permissions);
    if (valid.length !== permissions.length) {
      const known = new Set(valid);
      fail('VALIDATION_FAILED', `Unknown permission(s): ${permissions.filter((name) => !known.has(name)).join(', ')}`, {
        issues: [{ field: 'permissions', message: 'Unknown permission name' }],
      });
    }
  }

  const result = await upsertRole({ name: input.name.trim(), slug, description: input.description ?? null });
  const roleId = Number((result as unknown as { insertId: number }).insertId);
  if (permissions.length) await setRolePermissions(roleId, permissions);

  await writeActivityLog({
    ...actorOf(actor),
    action: 'created',
    module: 'role',
    entityType: 'roles',
    entityId: roleId,
    entityLabel: input.name,
    description: `Role ${input.name} (${slug}) created with ${permissions.length} permission(s)${input.clone_from ? `, cloned from ${input.clone_from}` : ''}`,
    newValues: { name: input.name, slug, permissions: permissions.length, clone_from: input.clone_from ?? null },
  });

  return { roleId, name: input.name, slug, permissions: permissions.length };
}

export async function updateRoleRecord(
  roleId: number,
  input: { name?: string; description?: string | null },
  actor: { user: AuthUser; ip?: string | null }
) {
  const role = await findRoleById(roleId);
  if (!role) fail('NOT_FOUND', 'That role does not exist');

  const changes: Record<string, string | null> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (input.name !== undefined && input.name !== role.name) {
    // Renaming a system role would break the slug-based guards elsewhere.
    if (Number(role.is_system_role) && input.name !== String(role.name)) {
      fail('INVALID_STATE', 'System role names are fixed — clone the role to get an editable copy');
    }
    changes.name = input.name.trim();
    before.name = role.name;
    after.name = changes.name;
  }
  if (input.description !== undefined && input.description !== (role.description ?? null)) {
    changes.description = input.description;
    before.description = role.description ?? null;
    after.description = input.description;
  }
  if (!Object.keys(changes).length) fail('NO_CHANGE', 'Change at least one field before saving');

  await updateRole(roleId, changes);

  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'role',
    entityType: 'roles',
    entityId: roleId,
    entityLabel: String(changes.name ?? role.name),
    description: `Role ${role.name} updated`,
    oldValues: before,
    newValues: after,
  });

  return { roleId, name: String(changes.name ?? role.name) };
}

export async function deleteRoleRecord(roleId: number, actor: { user: AuthUser; ip?: string | null }) {
  const role = await findRoleById(roleId);
  if (!role) fail('NOT_FOUND', 'That role does not exist');
  if (Number(role.is_system_role)) fail('INVALID_STATE', 'System roles cannot be deleted — they anchor the panels');

  const inUse = await roleUserCount(roleId);
  if (inUse > 0) fail('IN_USE', `${inUse} user(s) still hold the ${role.name} role`, { users: inUse });

  await archiveRole(roleId);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'deleted',
    module: 'role',
    entityType: 'roles',
    entityId: roleId,
    entityLabel: String(role.name),
    description: `Role ${role.name} (${role.slug}) removed`,
    oldValues: { name: role.name, slug: role.slug, permissions: role.permissions },
  });
  return { roleId, deleted: true, name: String(role.name) };
}

/** Writes the full grant set for one role — the matrix is authoritative. */
export async function saveRolePermissions(
  roleId: number,
  permissionNames: string[],
  actor: { user: AuthUser; ip?: string | null }
) {
  const role = await findRoleById(roleId);
  if (!role) fail('NOT_FOUND', 'That role does not exist');
  // The Super Administrator is the platform's escape hatch: it must always be
  // able to reach every screen, so its grant set is fixed.
  if (String(role.slug) === 'super_admin') {
    fail('INVALID_STATE', 'The Super Administrator always holds every permission — create a custom role for a narrower set');
  }

  const unique = [...new Set(permissionNames)];
  if (unique.length) {
    const valid = await permissionNamesExist(unique);
    if (valid.length !== unique.length) {
      const known = new Set(valid);
      const unknown = unique.filter((name) => !known.has(name));
      fail('VALIDATION_FAILED', `Unknown permission(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`);
    }
  }

  const previous = (await rolePermissionNames(roleId)).map((row) => String(row.name));
  const previousSet = new Set(previous);
  const nextSet = new Set(unique);
  const added = unique.filter((name) => !previousSet.has(name));
  const removed = previous.filter((name) => !nextSet.has(name));

  if (!added.length && !removed.length) fail('NO_CHANGE', 'That role already holds exactly these permissions');

  // A role that keeps every panel-permission but loses `dashboard.read` would
  // land its users on a broken landing page, so read access is never removed
  // from the dashboard module.
  const dashboardRead = permissionName('dashboard', 'read');
  if ((previous.includes(dashboardRead) || unique.includes('dashboard.create')) && !nextSet.has(dashboardRead)) {
    nextSet.add(dashboardRead);
    unique.push(dashboardRead);
  }

  await setRolePermissions(roleId, unique);

  // Anyone holding the role has different abilities from the next request on.
  const members = await roleMembers(roleId, 500);
  for (const member of members) {
    await revokeUserSessions(Number(member.id));
  }

  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'role',
    entityType: 'roles',
    entityId: roleId,
    entityLabel: String(role.name),
    description: `Permissions for ${role.name} updated — ${added.length} added, ${removed.length} removed (${unique.length} total)`,
    oldValues: { count: previous.length },
    newValues: { count: unique.length, added: added.slice(0, 20), removed: removed.slice(0, 20) },
  });

  await writeAuditTrail({
    tableName: 'role_permissions',
    recordId: roleId,
    operation: 'UPDATE',
    changes: {
      granted: { from: null, to: added.join(', ') || null },
      revoked: { from: removed.join(', ') || null, to: null },
      total: { from: previous.length, to: unique.length },
    },
    changedBy: actor.user.id,
    changedByName: actor.user.fullName,
    ipAddress: actor.ip ?? null,
  });

  return {
    roleId,
    roleName: String(role.name),
    granted: added.length,
    revoked: removed.length,
    total: unique.length,
    sessionsRevoked: members.length,
  };
}

/** The matrix screen: every permission × every role, plus the current grants. */
export async function permissionMatrix() {
  const [catalogue, roles, pairs] = await Promise.all([
    permissionCatalogue(),
    matrixRoles(),
    allRolePermissionPairs(),
  ]);

  const grants: Record<string, string[]> = {};
  for (const row of pairs as RowDataPacket[]) {
    const slug = String(row.role_slug);
    grants[slug] = grants[slug] ?? [];
    grants[slug].push(String(row.permission_name));
  }

  const modules = new Map<string, { module: string; permissions: { name: string; action: string; description: string | null }[] }>();
  for (const row of catalogue as RowDataPacket[]) {
    const module = String(row.module);
    if (!modules.has(module)) modules.set(module, { module, permissions: [] });
    modules.get(module)!.permissions.push({
      name: String(row.name),
      action: String(row.action),
      description: row.description ? String(row.description) : null,
    });
  }

  return {
    roles: (roles as RowDataPacket[]).map((row) => ({
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      isSystemRole: Boolean(Number(row.is_system_role)),
      permissions: Number(row.permissions),
      users: Number(row.users),
    })),
    modules: [...modules.values()],
    grants,
    catalogue: catalogue as RowDataPacket[],
    defaults: Object.fromEntries(
      ROLE_DEFINITIONS.map((role) => [role.slug, grantsForRole(role.slug)])
    ),
  };
}

/** Bulk matrix save — one transaction per role, partial failures reported. */
export async function savePermissionMatrix(
  input: { roles: { role_slug: string; permissions: string[] }[] },
  actor: { user: AuthUser; ip?: string | null }
) {
  const results: { role: string; status: 'saved' | 'unchanged' | 'error'; granted?: number; revoked?: number; total?: number; message?: string }[] = [];

  for (const row of input.roles) {
    const role = await findRoleBySlug(row.role_slug);
    if (!role) {
      results.push({ role: row.role_slug, status: 'error', message: 'Role not found' });
      continue;
    }
    try {
      const saved = await saveRolePermissions(Number(role.id), row.permissions, actor);
      results.push({ role: row.role_slug, status: 'saved', granted: saved.granted, revoked: saved.revoked, total: saved.total });
    } catch (error) {
      const serviceError = error as ServiceError;
      if (serviceError.code === 'NO_CHANGE') {
        results.push({ role: row.role_slug, status: 'unchanged' });
        continue;
      }
      results.push({ role: row.role_slug, status: 'error', message: serviceError.message });
    }
  }

  const saved = results.filter((row) => row.status === 'saved');
  if (!saved.length && results.every((row) => row.status !== 'error')) {
    fail('NO_CHANGE', 'Every role already holds exactly those permissions');
  }
  return {
    results,
    rolesChanged: saved.length,
    granted: saved.reduce((total, row) => total + (row.granted ?? 0), 0),
    revoked: saved.reduce((total, row) => total + (row.revoked ?? 0), 0),
  };
}
