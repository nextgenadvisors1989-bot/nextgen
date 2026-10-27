/**
 * GET    /api/admin/dynamic-forms/[formId] — the builder payload (form + structure)
 * PUT    /api/admin/dynamic-forms/[formId] — save the whole structure atomically
 * DELETE /api/admin/dynamic-forms/[formId] — delete (refused once submissions exist)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteForm, getFormDetail, updateForm } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    await requireAdminApi(['form.read']);
    return ok(await getFormDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms/[formId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    const user = await requireAdminApi(['form.update']);
    const body = await request.json();
    const result = await updateForm(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Form saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms/[formId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    const user = await requireAdminApi(['form.delete']);
    const result = await deleteForm(id, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Form deleted' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms/[formId]', method: 'DELETE' });
  }
}
