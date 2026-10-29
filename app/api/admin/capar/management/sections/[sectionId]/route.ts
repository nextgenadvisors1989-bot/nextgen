/** PUT /api/admin/capar/management/sections/[sectionId] - { group_id } moves every document of the checklist section to one CAPAR category. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { setSectionGroup } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const id = Number((await params).sectionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Section');
  try {
    await requireAdminApi(['capar.update']);
    const body = (await request.json().catch(() => ({}))) as { group_id?: unknown };
    return ok({ data: await setSectionGroup(id, body.group_id) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management/sections/[sectionId]', method: 'PUT' });
  }
}
