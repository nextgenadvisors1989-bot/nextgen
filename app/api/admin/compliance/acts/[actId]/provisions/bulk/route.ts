/**
 * POST /api/admin/compliance/acts/[actId]/provisions/bulk
 *   { parent_id?, nodes: [{ kind, number, title, body_html?, status?, amendments?, children?: [...] }] }
 * Adds many chapters, sections or sub sections in one go (typed lists in the builder, or an imported Act). All or nothing.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { bulkCreateProvisions } from '@/services/act-provision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = Number((await params).actId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Act');
  try {
    const user = await requireAdminApi(['compliance_act.update']);
    return ok({ data: await bulkCreateProvisions(id, await request.json().catch(() => ({})), user.id) }, { status: 201, message: 'Added' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions/bulk', method: 'POST' });
  }
}
