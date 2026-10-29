/** /api/capar/[reportId]/findings/[findingId]/review POST - the auditor approves or declines the employer's answer: { decision: approve | decline, note? }. */
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { reviewFinding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/review', method: 'POST' }, async (_user, actor) =>
    one(await reviewFinding(actor, reportId, findingId, await request.json().catch(() => ({}))), { message: 'Saved', status: 201 })
  );
}
