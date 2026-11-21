/** DELETE /api/data-management/entries/[id]/files/[linkId] — detaches a file from a record. */
import { notFound, ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { removeFile } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  if (!Number.isInteger(Number(id)) || !Number.isInteger(Number(linkId))) return notFound('File');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]/files/[linkId]', method: 'DELETE' }, async ({ actor, employerId }) => {
    await removeFile(actor, employerId, Number(id), Number(linkId));
    return ok({ id: Number(linkId) }, { message: 'File removed' });
  });
}
