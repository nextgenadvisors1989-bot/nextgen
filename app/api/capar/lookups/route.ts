/** GET /api/capar/lookups?type=employers|units|assignments|verifiers|acts|provisions|resources&q=&employerId= - pickers for the editor. */
import { ok, parseSearchParams } from '@/lib/utils/api-response';
import { withCapar } from '@/lib/api/capar-route';
import { lookup } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withCapar(request, { route: '/api/capar/lookups', method: 'GET' }, async (user) => {
    const params = Object.fromEntries(parseSearchParams(request));
    return ok(await lookup(user, String(params.type ?? ''), { q: params.q, employerId: Number(params.employerId) || undefined }));
  });
}
