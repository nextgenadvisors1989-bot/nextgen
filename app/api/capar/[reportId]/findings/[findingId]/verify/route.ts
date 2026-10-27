/** POST /api/capar/[reportId]/findings/[findingId]/verify - the verifier marks one finding Eligible / Not Eligible. */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { verifyFinding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/verify', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await verifyFinding(actor, reportId, findingId, body ?? {}), { message: 'Verification saved' });
  });
}
