/**
 * /api/admin/audit-assignments/[assignmentId]
 *
 * GET    — assignment + activity timeline + evidence files.
 * PUT    — partial update; schedule changes propagate to the calendar.
 * DELETE — removes the assignment (archives it instead once a report exists).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteAssignment, getAssignmentDetail, updateAssignment } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Assignment');

  try {
    await requireAdminApi(['audit_assignment.read']);
    const detail = await getAssignmentDetail(id);
    if (!detail) return notFound('Assignment');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments/[assignmentId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Assignment');

  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['audit_assignment.update']);
    userId = user.id;
    body = await request.json();

    const result = await updateAssignment(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Assignment');
    if (!result.updated) return fail('No changes were applied');

    return ok({ assignment: result.assignment }, { message: 'Assignment updated successfully' });
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/audit-assignments/[assignmentId]', method: 'PUT', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Assignment');

  try {
    const user = await requireAdminApi(['audit_assignment.delete']);
    const result = await deleteAssignment(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Assignment');
    if (!result.deleted) return fail(result.reason ?? 'Assignment cannot be deleted', 409);

    return ok({ deleted: true }, { message: 'Assignment deleted successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments/[assignmentId]', method: 'DELETE' });
  }
}
