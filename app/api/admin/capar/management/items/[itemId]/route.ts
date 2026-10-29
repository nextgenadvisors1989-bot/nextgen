/** PUT /api/admin/capar/management/items/[itemId] - { group_id } the CAPAR category this document belongs to. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { setItemGroup } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const id = Number((await params).itemId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    await requireAdminApi(['capar.update']);
    const body = (await request.json().catch(() => ({}))) as { group_id?: unknown };
    return ok({ data: await setItemGroup(id, body.group_id) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management/items/[itemId]', method: 'PUT' });
  }
}
