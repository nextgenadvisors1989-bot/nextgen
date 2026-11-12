/**
 * POST /api/admin/compliance/acts/[actId]/provisions/reorder   { ids: [3, 1, 2] }
 * Puts provisions that share a parent (chapters, or the sections of one chapter) in the given order.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { reorderProvisions } from '@/services/act-provision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = Number((await params).actId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Act');
  try {
    await requireAdminApi(['compliance_act.update']);
    return ok({ data: await reorderProvisions(id, await request.json().catch(() => ({}))) }, { message: 'Saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions/reorder', method: 'POST' });
  }
}
