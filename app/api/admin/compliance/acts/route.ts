/**
 * GET  /api/admin/compliance/acts — the act register with rule/regulation counts
 * POST /api/admin/compliance/acts — adds an act (name + year must be unique)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { actListQuerySchema } from '@/lib/validations/compliance.validation';
import { createAct, listActs } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_act.read']);
    const filters = actListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listActs(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, states: result.states },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['compliance_act.create']);
    const result = await createAct(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Act “${result.actName}” added to the register`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts', method: 'POST' });
  }
}
