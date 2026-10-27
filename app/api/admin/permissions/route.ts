/**
 * GET /api/admin/permissions — the permission matrix: every permission grouped
 * by module, every role as a column, the current grants and the platform
 * defaults so an administrator can see what a role "should" hold.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { permissionMatrix } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['permission.read']);
    return ok(await permissionMatrix());
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/permissions', method: 'GET' });
  }
}
