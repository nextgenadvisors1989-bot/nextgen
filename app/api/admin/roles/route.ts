/**
 * GET  /api/admin/roles — role register with member/permission counts, the
 *      system-vs-custom split and the matrix column data.
 * POST /api/admin/roles — create a role, optionally cloning the grants of an
 *      existing role before applying extra permissions.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { roleCreateSchema, roleListQuerySchema } from '@/lib/validations/user.validation';
import { createRoleRecord, listRoles } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['role.read']);
    const filters = roleListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listRoles(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, matrixRoles: result.matrixRoles },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['role.create']);
    const body = await request.json().catch(() => null);
    const input = roleCreateSchema.parse(body ?? {});
    const result = await createRoleRecord(input, { user, ip: clientIp(request) });
    return created(result, `Role ${result.name} created`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles', method: 'POST' });
  }
}
