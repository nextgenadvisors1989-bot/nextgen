/** DELETE /api/capar/[reportId]/files/[linkId] - remove a photo / evidence attachment from a finding. */
import { ok } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { removeFindingFile } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ reportId: string; linkId: string }> }) {
  const resolved = await params;
  const reportId = numericId(resolved.reportId);
  const linkId = numericId(resolved.linkId);
  if (!reportId || !linkId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/files/[linkId]', method: 'DELETE' }, async (_user, actor) => {
    await removeFindingFile(actor, reportId, linkId);
    return one({ id: linkId }, { message: 'Attachment removed' });
  });
}
