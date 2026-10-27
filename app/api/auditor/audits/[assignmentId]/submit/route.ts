/**
 * POST /api/auditor/audits/[assignmentId]/submit
 * Submits the auditor's report: the working copy is frozen into a revision, a PDF
 * is generated and filed, the verifier is queued and the auditor, verifier and
 * administrators are notified. Refused while verifier corrections are still open.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { identityFor, submitMyAudit } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Audit');

  try {
    const user = await requireAuditorApi(['audit_report.update']);
    const me = await identityFor(user.id);

    let body: unknown = {};
    try { body = await request.json(); } catch { body = {}; }

    const result = await submitMyAudit(id, body, {
      user, ip: clientIp(request), userAgent: request.headers.get('user-agent'),
    }, me.id);
    if (!result) return notFound('Audit');

    return ok(
      {
        report: result.report, version: result.version, pdfFileId: result.pdfFileId,
        verifierId: result.verifierId, warnings: result.warnings,
      },
      { message: `Report submitted as version ${result.version}` }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]/submit', method: 'POST' });
  }
}
