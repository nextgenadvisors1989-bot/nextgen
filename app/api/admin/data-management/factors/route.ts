/** /api/admin/data-management/factors — the emission-factor register: GET lists every factor, POST adds one. Nothing is pre-filled; a factor exists only when the client enters it. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { ACTIVITY_KEYS, listFactors, saveFactor } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['data_management.read']);
    return ok({ factors: await listFactors(), activities: ACTIVITY_KEYS });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/data-management/factors', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['data_management.create']);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const result = await saveFactor({ user, ip: clientIp(request), userAgent: userAgent(request) }, null, body);
    return created(result, 'Emission factor saved');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/data-management/factors', method: 'POST' });
  }
}
