/**
 * DELETE /api/employee/documents/:documentId — the employee withdraws one of
 * their own documents.
 *
 * Ownership is part of the lookup: somebody else's document is a 404, and one the
 * employer has already verified cannot be withdrawn at all (409) — verification
 * is an act of the establishment, and the employee cannot undo it unilaterally.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { getScoping } from '@/lib/auth/auth';
import { clientIp, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { withdrawMyDocument } from '@/services/employee.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ documentId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireEmployeeApi(['employee.update']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const { documentId } = await params;
    const id = Number(documentId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid document id', 400);

    const result = await withdrawMyDocument(employeeId, id, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return fail('That document is not on your record', 404, { code: 'NOT_FOUND' });

    return ok(result, { message: 'Document withdrawn' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/documents/:id', method: 'DELETE' });
  }
}
