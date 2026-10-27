/**
 * /api/capar
 * GET  - the reports the caller may see (scoped by role), with status counts.
 * POST - an auditor (or admin) starts a new CAPAR report.
 */
import { created, ok, parseSearchParams, serialize } from '@/lib/utils/api-response';
import { one, withCapar } from '@/lib/api/capar-route';
import { createReport, listReports } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withCapar(request, { route: '/api/capar', method: 'GET' }, async (user) => {
    const params = Object.fromEntries(parseSearchParams(request));
    const result = await listReports(user, {
      page: Number(params.page) || 1, limit: Number(params.limit) || 10, search: params.search, status: params.status,
      employerId: Number(params.employerId) || undefined, sortBy: params.sortBy, sortDir: params.sortDir,
    });
    return ok(serialize(result.data), { pagination: result.pagination, extra: { stats: result.stats } });
  });
}

export async function POST(request: Request) {
  return withCapar(request, { route: '/api/capar', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    const report = await createReport(actor, body ?? {});
    return one(report, { message: 'CAPAR report started', status: 201 });
  });
}
