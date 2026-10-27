/**
 * Re-exports the RBAC catalogue for the Node seed script. Kept separate from
 * `rbac.ts` so scripts never pull Next.js-only modules into their build.
 */
export {
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  permissionName,
  ROLE_DEFINITIONS,
  grantsForRole,
} from './rbac';

export function roleHasFullAccess(slug: string): boolean {
  return slug === 'super_admin';
}
