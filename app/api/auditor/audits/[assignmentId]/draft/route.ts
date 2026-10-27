/**
 * PUT /api/auditor/audits/[assignmentId]/draft
 * Saves the auditor's working copy of the report. No revision is written and no
 * PDF is generated — a draft is a draft — but the score, the finding counts and
 * the assignment progress are refreshed so the registers stay truthful.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { identityFor, saveMyDraft } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Audit');

  try {
    const user = await requireAuditorApi(['audit_report.update']);
    const me = await identityFor(user.id);

    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await saveMyDraft(id, body, {
      user, ip: clientIp(request), userAgent: request.headers.get('user-agent'),
    }, me.id);
    if (!result) return notFound('Audit');

    return ok(result, { message: 'Draft saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]/draft', method: 'PUT' });
  }
}
