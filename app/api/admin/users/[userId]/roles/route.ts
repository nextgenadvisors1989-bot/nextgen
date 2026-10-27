/** PATCH /api/admin/users/[userId]/roles — replace the role set for a login. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { roleAssignmentSchema } from '@/lib/validations/user.validation';
import { setUserRoleAssignment } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send at least one role', 400, { code: 'INVALID_JSON' });
    const input = roleAssignmentSchema.parse(body);
    const result = await setUserRoleAssignment(id, input.role_slugs, input.reason ?? null, { user, ip: clientIp(request) });
    return ok(result, { message: `Roles updated to ${result.roles.map((role) => role.name).join(', ')}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/roles', method: 'PATCH' });
  }
}
