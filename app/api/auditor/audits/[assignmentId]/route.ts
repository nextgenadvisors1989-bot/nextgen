/**
 * GET /api/auditor/audits/[assignmentId]
 * One audit in full: the assignment, the report with its working body, the
 * outstanding corrections, the evidence on file and the history. Ownership is
 * verified inside the service, so the id in the URL cannot reach another
 * auditor's work.
 */
import { requireAuditorApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { auditWorkspace, identityFor } from '@/services/auditor-workspace.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Audit');

  try {
    const user = await requireAuditorApi(['audit_assignment.read']);
    const me = await identityFor(user.id);

    const bundle = await auditWorkspace(id, me.id);
    if (!bundle) return notFound('Audit');

    return ok(bundle);
  } catch (error) {
    return handleRouteError(error, { route: '/api/auditor/audits/[assignmentId]', method: 'GET' });
  }
}
