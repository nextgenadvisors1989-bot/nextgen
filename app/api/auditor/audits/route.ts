/**
 * GET /api/auditor/audits
 * The signed-in auditor's assignment register, always scoped to them: filters,
 * sorting, pagination and the funnel counters shown on the page header.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { identityFor, listMyAudits, myAuditStats } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireAuditorApi(['audit_assignment.read']);
    const me = await identityFor(user.id);
    const params = parseSearchParams(request);

    const filters = {
      page: Number(params.get('page') ?? 1),
      limit: Number(params.get('limit') ?? 10),
      search: params.get('search') ?? undefined,
      status: params.get('status') ?? undefined,
      type: params.get('type') ?? undefined,
      priority: params.get('priority') ?? undefined,
      employerId: params.get('employerId') ? Number(params.get('employerId')) : undefined,
      unitId: params.get('unitId') ? Number(params.get('unitId')) : undefined,
      overdueOnly: params.get('overdueOnly') === 'true',
      dateFrom: params.get('dateFrom') ?? undefined,
      dateTo: params.get('dateTo') ?? undefined,
      sortBy: params.get('sortBy') ?? undefined,
      sortDir: params.get('sortDir') ?? undefined,
    };

    const [result, stats] = await Promise.all([
      listMyAudits(me.id, filters),
      myAuditStats(me.id),
    ]);

    return ok(result.data, { pagination: result.pagination, extra: { stats, auditor: me } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits', method: 'GET' });
  }
}
