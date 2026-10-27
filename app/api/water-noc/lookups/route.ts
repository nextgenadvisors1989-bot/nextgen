/** GET /api/water-noc/lookups?type=employers|units&q=&employerId= - pickers for the NOC form. */
import { ok, parseSearchParams } from '@/lib/utils/api-response';
import { withWater } from '@/lib/api/water-route';
import { lookup } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withWater(request, { route: '/api/water-noc/lookups', method: 'GET' }, async (user) => {
    const params = Object.fromEntries(parseSearchParams(request));
    return ok(await lookup(user, String(params.type ?? ''), { q: params.q, employerId: Number(params.employerId) || undefined }));
  });
}
