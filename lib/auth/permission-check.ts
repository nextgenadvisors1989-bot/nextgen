/**
 * Server-side authorisation gates. Every API route and protected page calls one
 * of these before touching data — URL manipulation alone can never escalate access.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from './auth';
import { hasAllPermissions, hasPermission, dashboardForRoles } from './rbac';
import type { AuthUser } from '@/types/user';

export class AuthorizationError extends Error {
  constructor(message: string, public readonly status: number = 403) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Returns the signed-in user or throws 401. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('Authentication required', 401);
  return user;
}

/** Page-level guard: redirects instead of throwing so the UI stays usable. */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/api/auth/expired');
  if (user.isFirstLogin) redirect('/change-password');
  return user;
}

/** Restricts a page to a set of panels. */
export async function requirePanel(allowed: string[]): Promise<AuthUser> {
  const user = await requirePageUser();
  const slugs = user.roles.map((r) => r.slug);
  if (slugs.includes('super_admin')) return user;
  if (!slugs.some((slug) => allowed.includes(slug))) {
    redirect(dashboardForRoles(slugs));
  }
  return user;
}

/**
 * API-side counterpart of `requirePanel`. Page guards stop a user from *seeing*
 * another panel; this stops them from *calling* it. Permissions alone are not
 * enough here — the auditor role legitimately holds `employer.read` for their
 * assigned employers, but that must never widen into the admin register.
 */
export async function requireApiPanel(allowed: string[]): Promise<AuthUser> {
  const user = await requireUser();
  const slugs = user.roles.map((r) => r.slug);
  if (slugs.includes('super_admin') || slugs.some((slug) => allowed.includes(slug))) return user;
  throw new AuthorizationError('This endpoint belongs to another workspace', 403);
}

export async function requirePermission(required: string | string[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, required)) {
    throw new AuthorizationError(`Missing permission: ${Array.isArray(required) ? required.join(', ') : required}`, 403);
  }
  return user;
}

export async function requireAllPermissions(required: string[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!hasAllPermissions(user.permissions, required)) {
    throw new AuthorizationError(`Missing permissions: ${required.join(', ')}`, 403);
  }
  return user;
}

export async function requireRole(roleSlugs: string[]): Promise<AuthUser> {
  const user = await requireUser();
  const slugs = user.roles.map((r) => r.slug);
  if (!slugs.includes('super_admin') && !slugs.some((s) => roleSlugs.includes(s))) {
    throw new AuthorizationError('Insufficient role', 403);
  }
  return user;
}

export function assertPermission(user: AuthUser, required: string | string[]) {
  if (!hasPermission(user.permissions, required)) {
    throw new AuthorizationError(`Missing permission: ${Array.isArray(required) ? required.join(', ') : required}`, 403);
  }
}

/**
 * Employer tenancy guard — an employer user may only ever read/write their own
 * company's records, regardless of what the request body claims.
 */
export function assertEmployerScope(user: AuthUser, employerId: number) {
  const slugs = user.roles.map((r) => r.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return;
  if (user.employerId !== employerId) {
    throw new AuthorizationError('You do not have access to this employer record', 403);
  }
}

/** Auditors may only touch assignments allocated to them. */
export function assertAuditorScope(user: AuthUser, auditorId: number | null) {
  const slugs = user.roles.map((r) => r.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin') || slugs.includes('verifier')) return;
  if (!user.auditorId || user.auditorId !== auditorId) {
    throw new AuthorizationError('This record is not assigned to you', 403);
  }
}

/** Employees may only read their own record. */
export function assertEmployeeScope(user: AuthUser, employeeId: number) {
  const slugs = user.roles.map((r) => r.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return;
  if (user.employeeId !== employeeId) {
    throw new AuthorizationError('You do not have access to this employee record', 403);
  }
}

export { hasPermission };
