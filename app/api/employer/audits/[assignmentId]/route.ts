/**
 * GET /api/employer/audits/:assignmentId — one of the company's audits, with its
 * history trail and its files. An audit belonging to another company is a 404.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getAssignmentDetail } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ assignmentId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireEmployerApi(['audit_assignment.read']);
    const { assignmentId } = await params;
    const id = Number(assignmentId);
    if (!Number.isFinite(id) || assignmentId.trim() === '') return fail('Invalid audit id', 400);

    const detail = await getAssignmentDetail(id);
    if (!detail) return notFound('Audit');
    if (Number(detail.assignment?.employer_id ?? 0) !== Number(user.employerId ?? 0)) return notFound('Audit');

    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/audits/:id', method: 'GET' });
  }
}
