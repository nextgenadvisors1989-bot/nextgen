/**
 * GET /api/auditor/forms/[formId] — the renderer contract for one form: sections,
 * fields, options, conditional logic, table columns, defaults and any open draft.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { actorFromUser, formSpec } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Form');
  try {
    const user = await requireAuditorApi(['form.read']);
    return ok(await formSpec(id, actorFromUser(user, request)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/forms/[formId]', method: 'GET' });
  }
}
