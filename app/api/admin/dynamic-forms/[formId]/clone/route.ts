/**
 * POST /api/admin/dynamic-forms/[formId]/clone — duplicates a form inside the
 * same module (structure only; submissions stay with the original).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, notFound, userAgent } from '@/lib/utils/api-response';
import { cloneForm } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    const user = await requireAdminApi(['form.create']);
    const body = await request.json();
    const result = await cloneForm(id, body, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, 'Form duplicated');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms/[formId]/clone', method: 'POST' });
  }
}
