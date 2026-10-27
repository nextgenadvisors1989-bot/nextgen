/**
 * GET  /api/admin/compliance/regulations — instruments issued under the acts
 * POST /api/admin/compliance/regulations — creates one (act/rule must agree)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { regulationListQuerySchema } from '@/lib/validations/compliance.validation';
import { createRegulation, listRegulations } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_regulation.read']);
    const filters = regulationListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listRegulations(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, actOptions: result.actOptions },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/regulations', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['compliance_regulation.create']);
    const result = await createRegulation(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Regulation “${result.regulationName}” created`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/regulations', method: 'POST' });
  }
}
