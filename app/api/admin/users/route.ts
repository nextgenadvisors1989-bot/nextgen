/**
 * GET  /api/admin/users — the user register: search, role/status/portal/lock
 *      filters, sorting, statistics and the option lists the screen needs.
 * POST /api/admin/users — create a login, optionally bound to an employer,
 *      auditor or employee record. Credentials and a 72-hour activation link go
 *      out by email unless `send_credentials` is false.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { userCreateSchema, userListQuerySchema } from '@/lib/validations/user.validation';
import { createUser, listUsers } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['user.read']);
    const filters = userListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listUsers(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: result.stats,
        byRole: result.byRole,
        pendingActivation: result.pendingActivation,
        sessions: result.sessions,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['user.create']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return handleRouteError(new Error('Send the new account details'), { route: '/api/admin/users', method: 'POST' });
    }
    const input = userCreateSchema.parse(body);
    const result = await createUser(input, { user, ip: clientIp(request) });
    return created(result, `Login created for ${result.email}`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users', method: 'POST' });
  }
}
