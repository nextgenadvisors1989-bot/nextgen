/**
 * GET  /api/employer/units — the establishment's own units.
 * POST /api/employer/units — adds a unit to the session's company. An employer id
 *      in the body is ignored: the unit is filed against the session, never
 *      against whatever the form happened to send.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createUnit, listUnits } from '@/services/employer.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['company_unit.read']);
    const params = parseSearchParams(request);
    const employerId = Number(user.employerId ?? 0);
    const data = employerId
      ? await listUnits(employerId, {
          search: params.get('search') || undefined,
          status: params.get('status') || undefined,
        })
      : [];
    return ok(data, { extra: { stats: { total: data.length } } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/units', method: 'GET' });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['company_unit.create']);
    const employerId = Number(user.employerId ?? 0);
    const result = await createUnit(employerId, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return ok({ unitId: null }, { message: 'No company file to add a unit to' });
    return created({ unitId: result.unitId }, 'Unit added successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/units', method: 'POST', body });
  }
}
