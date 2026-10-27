/**
 * /api/admin/roles/[roleId]/permissions
 *
 * GET — current permission names plus the catalogue.
 * PUT — replace the whole grant set for the role (the matrix is authoritative);
 *       sessions of every member are revoked so the new grants take effect.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { rolePermissionSchema } from '@/lib/validations/user.validation';
import { getRoleDetail, saveRolePermissions } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const id = parseId((await params).roleId);
  if (!id) return notFound('Role');

  try {
    await requireAdminApi(['role.read']);
    const detail = await getRoleDetail(id);
    return ok({
      role: detail.role,
      permissions: detail.permissionNames,
      catalogue: detail.catalogue,
      members: detail.members,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles/[roleId]/permissions', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const id = parseId((await params).roleId);
  if (!id) return notFound('Role');

  try {
    const user = await requireAdminApi(['role.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the permission set', 400, { code: 'INVALID_JSON' });
    const input = rolePermissionSchema.parse(body);
    const result = await saveRolePermissions(id, input.permissions, { user, ip: clientIp(request) });
    return ok(result, {
      message: `${result.roleName}: ${result.granted} granted, ${result.revoked} revoked (${result.total} total)`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles/[roleId]/permissions', method: 'PUT' });
  }
}
