/**
 * PUT /api/admin/permissions/matrix — save several roles' grant sets in one
 * request. Each role is written independently; the response reports per-role
 * outcomes plus the totals so the screen can summarise the change.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { permissionMatrixSchema } from '@/lib/validations/user.validation';
import { savePermissionMatrix } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  try {
    const user = await requireAdminApi(['role.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the roles you want to save', 400, { code: 'INVALID_JSON' });
    const input = permissionMatrixSchema.parse(body);
    const result = await savePermissionMatrix(input, { user, ip: clientIp(request) });
    return ok(result, {
      message: result.rolesChanged
        ? `${result.rolesChanged} role(s) updated — ${result.granted} granted, ${result.revoked} revoked`
        : 'No permission changes were needed',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/permissions/matrix', method: 'PUT' });
  }
}
