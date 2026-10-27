/**
 * POST /api/admin/audit-assignments/[assignmentId]/reassign
 * Moves the audit to another auditor (optionally a new verifier) with a reason,
 * notifying both the outgoing and incoming auditor, and keeps the calendar row
 * pointing at the new auditor.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { reassignAssignment } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Assignment');

  try {
    const user = await requireAdminApi(['audit_assignment.update']);
    const result = await reassignAssignment(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Assignment');

    return ok(
      { assignment: result.assignment, capacity: result.capacity, warnings: result.warnings },
      { message: `Assignment reassigned to ${result.capacity.auditorName}` }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments/[assignmentId]/reassign', method: 'POST' });
  }
}
