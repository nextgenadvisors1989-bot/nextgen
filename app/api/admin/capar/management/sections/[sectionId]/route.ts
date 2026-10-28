/** PUT /api/admin/capar/management/sections/[sectionId] - { auditor_ids: [], mode: 'add' | 'set' } for every document of the section. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { setSectionAuditors } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const id = Number((await params).sectionId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Section');
  try {
    const user = await requireAdminApi(['capar.update']);
    const body = (await request.json().catch(() => ({}))) as { auditor_ids?: unknown; mode?: unknown };
    return ok({ data: await setSectionAuditors(id, body.auditor_ids, body.mode, user.id) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management/sections/[sectionId]', method: 'PUT' });
  }
}
