/**
 * POST /api/auditor/audits/[assignmentId]/start
 * Opens the audit: creates the report draft (or resumes the existing one) and
 * moves the assignment to In Progress. Idempotent, so a double click is safe.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { identityFor, startAudit } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Audit');

  try {
    const user = await requireAuditorApi(['audit_report.create']);
    const me = await identityFor(user.id);

    const result = await startAudit(id, me.id, {
      user, ip: clientIp(request), userAgent: request.headers.get('user-agent'),
    });

    return ok(result, {
      message: result.resumed
        ? `Resuming ${result.reportNumber}`
        : `Audit started — report ${result.reportNumber} created`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]/start', method: 'POST' });
  }
}
