/**
 * GET /api/admin/error-logs — the captured-error queue.
 *
 * Every unhandled failure the API raises lands here with its stack trace, so an
 * operator can triage by severity and mark incidents resolved with a note.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { errorLogQuerySchema } from '@/lib/validations/audit-log.validation';
import { listErrorLogs } from '@/services/audit-log.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['activity_log.read']);
    const filters = errorLogQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listErrorLogs(filters);

    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, facets: result.facets },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/error-logs', method: 'GET' });
  }
}
