/** /api/capar/[reportId]/findings/[findingId]/respond POST - the employer submits the fix: { response_text, signature_kind, signature_data }. */
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { respondToFinding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string; findingId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const findingId = numericId(resolved.findingId);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]/respond', method: 'POST' }, async (_user, actor) =>
    one(await respondToFinding(actor, reportId, findingId, await request.json().catch(() => ({}))), { message: 'Saved', status: 201 })
  );
}
