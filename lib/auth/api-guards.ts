/**
 * Workspace guards for API routes.
 *
 * Each panel's endpoints live under its own prefix, and every handler starts by
 * asserting that the caller belongs to that workspace. This is what makes
 * "role-based access that cannot be bypassed by calling the URL directly" true
 * for the API, independent of the page-level guards in `permission-check.ts`.
 */
import { requireApiPanel, requireAllPermissions } from './permission-check';
import type { AuthUser } from '@/types/user';

/** Admin / super-admin workspaces: the platform-wide registers. */
export async function requireAdminApi(requiredPermissions: string[]): Promise<AuthUser> {
  const user = await requireApiPanel(['admin', 'super_admin']);
  if (requiredPermissions.length) await requireAllPermissions(requiredPermissions);
  return user;
}

/** Auditor workspace endpoints. */
export async function requireAuditorApi(requiredPermissions: string[] = []): Promise<AuthUser> {
  const user = await requireApiPanel(['auditor']);
  if (requiredPermissions.length) await requireAllPermissions(requiredPermissions);
  return user;
}

/** Employer workspace endpoints. */
export async function requireEmployerApi(requiredPermissions: string[] = []): Promise<AuthUser> {
  const user = await requireApiPanel(['employer']);
  if (requiredPermissions.length) await requireAllPermissions(requiredPermissions);
  return user;
}

/**
 * Employee self-service endpoints. These are always scoped to the caller's own
 * employee record — `assertEmployeeScope` in permission-check.ts enforces that
 * on every record-level operation.
 */
export async function requireEmployeeApi(requiredPermissions: string[] = []): Promise<AuthUser> {
  const user = await requireApiPanel(['employee']);
  if (requiredPermissions.length) await requireAllPermissions(requiredPermissions);
  return user;
}

/** Verifier workspace endpoints. */
export async function requireVerifierApi(requiredPermissions: string[] = []): Promise<AuthUser> {
  const user = await requireApiPanel(['verifier']);
  if (requiredPermissions.length) await requireAllPermissions(requiredPermissions);
  return user;
}
