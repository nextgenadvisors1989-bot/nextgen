/**
 * GET /api/admin/login-attempts — every sign-in, successful or not.
 *
 * Failed attempts carry their reason (`User not found`, `Account locked`,
 * `Incorrect password`), which is what turns the screen into a security view:
 * the response also lists addresses with repeated failures.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { loginAttemptQuerySchema } from '@/lib/validations/audit-log.validation';
import { listLoginAttempts } from '@/services/audit-log.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['activity_log.read']);
    const filters = loginAttemptQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listLoginAttempts(filters);

    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, reasons: result.reasons, suspicious: result.suspicious },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/login-attempts', method: 'GET' });
  }
}
