/** POST /api/capar/[reportId]/submit - the auditor signs the report and sends it to the employer. Body: { signature_kind, signature_data }. */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { submitReport } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/submit', method: 'POST' }, async (_user, actor) =>
    one(await submitReport(actor, id, await request.json().catch(() => ({}))), { message: 'Report submitted to the employer' })
  );
}
