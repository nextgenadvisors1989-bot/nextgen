/**
 * POST /api/admin/dynamic-forms/[formId]/publish — publishes a form as the next
 * version once every section/field/table/formula passes the readiness checks.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { publishForm } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    const user = await requireAdminApi(['form.update']);
    const result = await publishForm(id, {
      id: user.id, name: user.fullName, role: user.primaryRole,
      ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Form published as v${result.version}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms/[formId]/publish', method: 'POST' });
  }
}
