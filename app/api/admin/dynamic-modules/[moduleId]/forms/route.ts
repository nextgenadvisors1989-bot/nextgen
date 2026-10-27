/**
 * GET  /api/admin/dynamic-modules/[moduleId]/forms — the forms inside a module
 * POST /api/admin/dynamic-modules/[moduleId]/forms — create a form (full structure)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { createForm, getModuleDetail } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    await requireAdminApi(['form.read']);
    const detail = await getModuleDetail(id);
    return ok({ module: detail.module, forms: detail.forms, stats: detail.stats });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/forms', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Module');
  try {
    const user = await requireAdminApi(['form.create']);
    const body = await request.json();
    const result = await createForm(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, 'Form created');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/[moduleId]/forms', method: 'POST' });
  }
}
