/**
 * GET /api/pdf/employee-document/[employeeId]?type=appointment-order
 *
 * One personal-file document (appointment order, Form F, Form 2, Form 11, ...) filled from the employee record.
 * Administrators and the employee's own employer only; the employee, auditors and verifiers are refused. Written to the activity log.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { EMPLOYEE_DOCUMENTS, generateEmployeeDocument, isEmployeeDocumentType } from '@/lib/pdf/employee-documents';
import { pdfResponse } from '@/lib/pdf/register-access';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp, fail, handleRouteError, notFound } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const id = Number((await params).employeeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Employee');
  try {
    const type = new URL(request.url).searchParams.get('type');
    if (!isEmployeeDocumentType(type)) return fail(`Unknown document. Choose one of: ${EMPLOYEE_DOCUMENTS.map((d) => d.type).join(', ')}`, 422);

    const user = await requireApiPanel(['admin', 'super_admin', 'employer']);
    await requireAllPermissions(['employee.read']);
    const scope = await queryOne<RowDataPacket>('SELECT id, employer_id, employee_number, name FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id]);
    if (!scope) return notFound('Employee');
    const isAdmin = user.roles.some((role) => role.slug === 'admin' || role.slug === 'super_admin');
    if (!isAdmin && Number(scope.employer_id) !== Number(user.employerId)) return notFound('Employee');

    const buffer = await generateEmployeeDocument(id, type, { generatedByName: user.fullName, generatedByRole: user.primaryRole });
    if (!buffer) return notFound('Employee');
    const label = EMPLOYEE_DOCUMENTS.find((d) => d.type === type)?.label ?? type;
    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole, employerId: Number(scope.employer_id), action: 'exported', module: 'employee',
      entityType: 'employees', entityId: id, entityLabel: `${scope.name} (${scope.employee_number})`, description: `${label} generated for ${scope.name}`, ipAddress: clientIp(request),
    });
    return pdfResponse(buffer, `${type}-${String(scope.employee_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/employee-document/[employeeId]', method: 'GET' });
  }
}
