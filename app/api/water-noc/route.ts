/**
 * /api/water-noc
 * GET  - the groundwater NOCs the caller may see, each with its recent usage against the approved quantity.
 * POST - a Water auditor (or admin) records a NOC.
 */
import { ok, parseSearchParams, serialize } from '@/lib/utils/api-response';
import { one, withWater } from '@/lib/api/water-route';
import { createNoc, listNocs } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withWater(request, { route: '/api/water-noc', method: 'GET' }, async (user) => {
    const params = Object.fromEntries(parseSearchParams(request));
    const result = await listNocs(user, {
      page: Number(params.page) || 1, limit: Number(params.limit) || 10, search: params.search,
      employerId: Number(params.employerId) || undefined, sortBy: params.sortBy, sortDir: params.sortDir,
    });
    return ok(serialize(result.data), { pagination: result.pagination });
  });
}

export async function POST(request: Request) {
  return withWater(request, { route: '/api/water-noc', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await createNoc(actor, body ?? {}), { message: 'Groundwater NOC recorded', status: 201 });
  });
}
