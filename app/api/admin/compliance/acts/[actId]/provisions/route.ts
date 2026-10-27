/**
 * GET  /api/admin/compliance/acts/[actId]/provisions — the Act's chapters, sections and sub sections (a tree) with explanations and amendments
 * POST /api/admin/compliance/acts/[actId]/provisions — adds one
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { actTree, createProvision } from '@/services/act-provision.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function actKey(params: Promise<{ actId: string }>) {
  const id = Number((await params).actId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = await actKey(params);
  if (!id) return notFound('Act');
  try {
    await requireAdminApi(['compliance_act.read']);
    return ok({ data: await actTree(id) });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ actId: string }> }) {
  const id = await actKey(params);
  if (!id) return notFound('Act');
  try {
    const user = await requireAdminApi(['compliance_act.update']);
    return ok({ data: await createProvision(id, await request.json().catch(() => ({})), user.id) }, { status: 201, message: 'Added' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/acts/[actId]/provisions', method: 'POST' });
  }
}
