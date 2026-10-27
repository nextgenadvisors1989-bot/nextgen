/** POST /api/capar/[reportId]/decision - the verifier approves the report or returns it with comments. */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { decide } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/decision', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    const report = await decide(actor, id, body ?? {});
    return one(report, { message: report?.status === 'Approved' ? 'Report approved' : 'Report returned to the auditor' });
  });
}
