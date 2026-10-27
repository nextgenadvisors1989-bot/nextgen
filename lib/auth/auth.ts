/**
 * Authentication business logic: login, logout, password lifecycle.
 * Every mutation writes to activity_logs / login_attempts for the audit trail.
 */
import { cookies } from 'next/headers';
import { randomBytes, randomUUID } from 'node:crypto';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password';
import {
  SESSION_COOKIE, createSession, hashToken, resolveSession, revokeAllUserSessions,
  revokeSession, ttlSeconds,
} from './session';
import { dashboardForRoles } from './rbac';
import { cachedAuthUser } from './auth-cache';
import { writeActivityLog } from '@/lib/logger/activity-log';
import type { AuthUser } from '@/types/user';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface LoginResult {
  ok: boolean;
  message: string;
  code?: 'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_LOCKED' | 'VALIDATION';
  redirectTo?: string;
  user?: AuthUser;
  mustChangePassword?: boolean;
  /** Cookie material the route handler must attach to the response. */
  session?: { token: string; csrfToken: string; expiresAt: Date };
}

interface UserRow extends RowDataPacket {
  id: number;
  uuid: string;
  email: string;
  username: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  profile_photo: string | null;
  status: 'active' | 'inactive' | 'suspended';
  is_first_login: number;
  last_login_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
  deleted_at: string | null;
}

/** Resolves role slugs for a user. */
export async function getUserRoles(userId: number) {
  return query<{ id: number; name: string; slug: string }>(
    `SELECT r.id, r.name, r.slug
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.id`,
    [userId]
  );
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT DISTINCT p.name
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.name);
}

/** Resolves the panel scoping keys (employer / auditor / employee) for a user. */
export async function getScoping(userId: number) {
  const [employer, auditor, employee] = await Promise.all([
    queryOne<{ employer_id: number }>('SELECT employer_id FROM employer_users WHERE user_id = ? ORDER BY is_primary DESC LIMIT 1', [userId]),
    queryOne<{ id: number }>('SELECT id FROM auditors WHERE user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]),
    queryOne<{ id: number }>('SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]),
  ]);
  return {
    employerId: employer?.employer_id ?? null,
    auditorId: auditor?.id ?? null,
    employeeId: employee?.id ?? null,
  };
}

/** Builds the full AuthUser identity used by layouts, APIs and permission checks. */
export async function resolveAuthUser(userId: number, sessionId: string): Promise<AuthUser | null> {
  const user = await queryOne<UserRow>(
    `SELECT id, uuid, email, username, first_name, last_name, mobile, profile_photo, status,
            is_first_login, last_login_at, deleted_at
       FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!user || user.deleted_at || user.status !== 'active') return null;

  const [roles, permissions, scope] = await Promise.all([
    getUserRoles(userId),
    getUserPermissions(userId),
    getScoping(userId),
  ]);

  const roleSlugs = roles.map((r) => r.slug);
  const primaryRole = roleSlugs.includes('super_admin') ? 'super_admin' : roleSlugs[0] ?? 'employee';

  return {
    id: user.id,
    uuid: user.uuid,
    email: user.email,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`.trim(),
    mobile: user.mobile,
    profilePhoto: user.profile_photo,
    status: user.status,
    isFirstLogin: Boolean(user.is_first_login),
    lastLoginAt: user.last_login_at,
    roles,
    primaryRole,
    permissions,
    dashboardPath: dashboardForRoles(roleSlugs),
    ...scope,
    sessionId,
  };
}

/** Reads the session cookie and returns the signed-in user (or null). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return cachedAuthUser(token, async () => {
    const session = await resolveSession(token);
    if (!session) return null;
    return resolveAuthUser(session.userId, session.sessionId);
  });
}

export async function setSessionCookies(token: string, csrfToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  // Readable by JS on purpose: the client echoes it back in the X-CSRF-Token header.
  cookieStore.set('cos_csrf', csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete('cos_csrf');
}

/** Validates credentials, enforces lockout, updates login metadata, creates a session. */
export async function loginUser(
  identifier: string,
  password: string,
  rememberMe = false,
  meta: { ip?: string | null; userAgent?: string | null } = {}
): Promise<LoginResult> {
  if (!identifier?.trim() || !password) {
    return { ok: false, code: 'VALIDATION', message: 'Username/email and password are required' };
  }

  const user = await queryOne<UserRow>(
    `SELECT * FROM users
      WHERE (email = ? OR username = ?) AND deleted_at IS NULL
      LIMIT 1`,
    [identifier.trim(), identifier.trim()]
  );

  const recordAttempt = async (success: boolean, failureReason?: string, userId?: number) => {
    await insert(
      `INSERT INTO login_attempts (email, user_id, success, failure_reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [identifier.trim(), userId ?? null, success, failureReason ?? null, meta.ip ?? null, meta.userAgent?.slice(0, 500) ?? null]
    );
  };

  if (!user) {
    await recordAttempt(false, 'User not found');
    return { ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username/email or password' };
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    await recordAttempt(false, 'Account locked', user.id);
    return {
      ok: false,
      code: 'ACCOUNT_LOCKED',
      message: `Account is temporarily locked. Try again in ${minutes} minute(s).`,
    };
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    const failed = user.failed_login_count + 1;
    const shouldLock = failed >= MAX_FAILED_ATTEMPTS;
    await execute(
      `UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?`,
      [shouldLock ? 0 : failed, shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, user.id]
    );
    await recordAttempt(false, 'Invalid password', user.id);
    return {
      ok: false,
      code: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      message: shouldLock
        ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`
        : `Invalid username/email or password. ${MAX_FAILED_ATTEMPTS - failed} attempt(s) remaining.`,
    };
  }

  if (user.status === 'suspended') {
    await recordAttempt(false, 'Account suspended', user.id);
    return { ok: false, code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended. Contact your administrator.' };
  }
  if (user.status !== 'active') {
    await recordAttempt(false, 'Account inactive', user.id);
    return { ok: false, code: 'ACCOUNT_INACTIVE', message: 'Your account is inactive. Contact your administrator.' };
  }

  const roleSlugs = (await getUserRoles(user.id)).map((r) => r.slug);
  const primaryRole = roleSlugs.includes('super_admin') ? 'super_admin' : roleSlugs[0] ?? 'employee';

  const session = await createSession({
    userId: user.id,
    roleSlug: primaryRole,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    rememberMe,
  });

  await execute(
    `UPDATE users
        SET last_login_at = NOW(), last_login_ip = ?, failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
    [meta.ip ?? null, user.id]
  );
  await recordAttempt(true, undefined, user.id);

  const authUser = await resolveAuthUser(user.id, session.sessionId);
  if (!authUser) {
    return { ok: false, code: 'ACCOUNT_INACTIVE', message: 'Unable to resolve account. Contact your administrator.' };
  }

  await writeActivityLog({
    userId: user.id,
    userName: authUser.fullName,
    userRole: authUser.primaryRole,
    action: 'login',
    module: 'auth',
    entityType: 'user',
    entityId: user.id,
    entityLabel: authUser.fullName,
    description: `${authUser.fullName} signed in`,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  return {
    ok: true,
    message: 'Signed in successfully',
    user: authUser,
    redirectTo: authUser.isFirstLogin ? '/change-password' : authUser.dashboardPath,
    mustChangePassword: authUser.isFirstLogin,
    session: { token: session.token, csrfToken: session.csrfToken, expiresAt: session.expiresAt },
  };
}

export async function logoutUser(current: AuthUser | null): Promise<void> {
  if (current) {
    await revokeSession(current.sessionId);
    await writeActivityLog({
      userId: current.id,
      userName: current.fullName,
      userRole: current.primaryRole,
      action: 'logout',
      module: 'auth',
      entityType: 'user',
      entityId: current.id,
      entityLabel: current.fullName,
      description: `${current.fullName} signed out`,
    });
  }
  await clearSessionCookies();
}

/** Issues a single-use reset token. Returns the raw token for the email link. */
export async function createPasswordResetToken(email: string, ip?: string | null) {
  const user = await queryOne<{ id: number; first_name: string; last_name: string; email: string; status: string }>(
    'SELECT id, first_name, last_name, email, status FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email.trim().toLowerCase()]
  );
  if (!user || user.status !== 'active') return null;

  const token = randomBytes(32).toString('hex');
  await insert(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)`,
    [user.id, hashToken(token), ip ?? null]
  );
  return { token, user: { id: user.id, name: `${user.first_name} ${user.last_name}`, email: user.email } };
}

export async function resetPasswordWithToken(token: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) {
    return { ok: false, message: 'Passwords do not match' };
  }
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return { ok: false, message: strength.errors[0] ?? 'Password does not meet policy' };
  }

  const row = await queryOne<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
      LIMIT 1`,
    [hashToken(token)]
  );
  if (!row) return { ok: false, message: 'This reset link is invalid or has expired. Please request a new one.' };

  const hash = await hashPassword(newPassword);
  await execute('UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?', [hash, row.user_id]);
  await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);
  await revokeAllUserSessions(row.user_id);

  await writeActivityLog({
    userId: row.user_id,
    action: 'password_reset',
    module: 'auth',
    entityType: 'user',
    entityId: row.user_id,
    description: 'Password reset via email link; all sessions revoked',
  });

  return { ok: true, message: 'Password reset successfully. Please sign in with your new password.' };
}

/** First-login / voluntary password change. */
export async function changeUserPassword(
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  if (newPassword !== confirmPassword) return { ok: false, message: 'New passwords do not match' };

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) return { ok: false, message: strength.errors[0] ?? 'Password does not meet policy' };

  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    return { ok: false, message: 'Current password is incorrect' };
  }
  if (await verifyPassword(newPassword, row.password_hash)) {
    return { ok: false, message: 'New password must be different from the current password' };
  }

  const hash = await hashPassword(newPassword);
  await execute('UPDATE users SET password_hash = ?, is_first_login = FALSE WHERE id = ?', [hash, user.id]);

  // Keep the current session alive, kill everything else.
  if (!user.isFirstLogin) {
    await revokeAllUserSessions(user.id, user.sessionId);
  }

  await writeActivityLog({
    userId: user.id,
    userName: user.fullName,
    userRole: user.primaryRole,
    action: 'password_changed',
    module: 'auth',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.fullName,
    description: 'Password changed',
  });

  return { ok: true, message: 'Password changed successfully' };
}

/** Creates a users row + role assignment. Used by admin/employer onboarding flows. */
export async function createUserAccount(input: {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  mobile?: string | null;
  roleSlugs: string[];
  createdBy?: number | null;
  isFirstLogin?: boolean;
}): Promise<number> {
  const passwordHash = await hashPassword(input.password);
  const userId = await insert(
    `INSERT INTO users (uuid, email, username, password_hash, first_name, last_name, mobile,
                        status, is_first_login, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      randomUUID(), input.email.toLowerCase(), input.username, passwordHash,
      input.firstName, input.lastName, input.mobile ?? null,
      input.isFirstLogin === false ? 0 : 1,
      input.createdBy ?? null, input.createdBy ?? null,
    ]
  );

  if (input.roleSlugs.length) {
    const placeholders = input.roleSlugs.map(() => '?').join(', ');
    const roles = await query<{ id: number }>(`SELECT id FROM roles WHERE slug IN (${placeholders})`, input.roleSlugs);
    for (const role of roles) {
      await insert('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)', [
        userId, role.id, input.createdBy ?? null,
      ]);
    }
  }
  return userId;
}

export { ttlSeconds };
