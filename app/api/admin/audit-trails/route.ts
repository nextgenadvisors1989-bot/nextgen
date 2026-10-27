/**
 * GET /api/admin/audit-trails — field-level change history.
 *
 * One row per changed column, so the screen can answer "when did this field
 * change, who changed it and what was it before".
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { auditTrailQuerySchema } from '@/lib/validations/audit-log.validation';
import { listAuditTrails } from '@/services/audit-log.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['activity_log.read']);
    const filters = auditTrailQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listAuditTrails(filters);

    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, facets: result.facets },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-trails', method: 'GET' });
  }
}
