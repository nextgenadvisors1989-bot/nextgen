/**
 * GET /api/pdf/employee/[employeeId]
 *
 * Streams the employee's personal file as a PDF (template: Employee Personal
 * File, ≤12 pages). Reachable from three workspaces, each scoped:
 *   admin / super_admin  → employee.read
 *   employer             → employee.read, own employees only
 *   employee             → own record only
 * The download is written to the activity log with the requesting principal.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { generateEmployeePdf } from '@/lib/pdf/employee-pdf';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp, fail, handleRouteError, notFound } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Employee');

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'employer', 'employee']);
    const slugs = user.roles.map((role) => role.slug);
    const scope = await queryOne<{ id: number; employer_id: number; employee_number: string; name: string } & RowDataPacket>(
      'SELECT id, employer_id, employee_number, name FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (!scope) return notFound('Employee');

    if (slugs.includes('admin') || slugs.includes('super_admin')) {
      await requireAllPermissions(['employee.read']);
    } else if (slugs.includes('employer')) {
      await requireAllPermissions(['employee.read']);
      if (Number(scope.employer_id) !== Number(user.employerId)) {
        return fail('This employee does not belong to your organisation', 403);
      }
    } else {
      await requireAllPermissions(['employee.read', 'payslip.download']);
      if (Number(user.employeeId) !== id) {
        return fail('You can only download your own personal file', 403);
      }
    }

    const buffer = await generateEmployeePdf(id, {
      generatedByName: user.fullName,
      generatedByRole: user.primaryRole,
    });
    if (!buffer) return notFound('Employee');

    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole,
      employerId: Number(scope.employer_id), action: 'exported', module: 'employee',
      entityType: 'employees', entityId: id,
      entityLabel: `${scope.name} (${scope.employee_number})`,
      description: `Personal file PDF generated for ${scope.name} (${scope.employee_number})`,
      ipAddress: clientIp(request),
    });

    const filename = `personal-file-${scope.employee_number.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/employee/[employeeId]', method: 'GET' });
  }
}
