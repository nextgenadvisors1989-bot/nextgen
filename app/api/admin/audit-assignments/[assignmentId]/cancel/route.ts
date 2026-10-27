/**
 * POST /api/admin/audit-assignments/[assignmentId]/cancel
 * Cancels the audit, marks its calendar rows cancelled and tells the auditor why.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { cancelAssignment } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Assignment');

  try {
    const user = await requireAdminApi(['audit_assignment.update']);
    const result = await cancelAssignment(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Assignment');

    return ok({ assignment: result.assignment }, { message: 'Assignment cancelled' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments/[assignmentId]/cancel', method: 'POST' });
  }
}
