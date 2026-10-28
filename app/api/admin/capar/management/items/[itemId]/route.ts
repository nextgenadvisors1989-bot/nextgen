/** PUT /api/admin/capar/management/items/[itemId] - { auditor_ids: [] } the auditors who work on this document. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { setItemAuditors } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const id = Number((await params).itemId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireAdminApi(['capar.update']);
    const body = (await request.json().catch(() => ({}))) as { auditor_ids?: unknown };
    return ok({ data: await setItemAuditors(id, body.auditor_ids, user.id) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management/items/[itemId]', method: 'PUT' });
  }
}
