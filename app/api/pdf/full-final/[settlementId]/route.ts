/**
 * GET /api/pdf/full-final/[settlementId] - the full and final settlement statement.
 * Admins read any; an employer reads its own company's; an employee reads only their own, and only once it is Approved or Paid.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { generateFullFinalPdf } from '@/lib/pdf/full-final-pdf';
import { pdfResponse } from '@/lib/pdf/register-access';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp, handleRouteError, notFound } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ settlementId: string }> }) {
  const id = Number((await params).settlementId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Settlement');
  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'employer', 'employee']);
    const slugs = user.roles.map((role) => role.slug);
    const record = await queryOne<RowDataPacket>('SELECT id, employer_id, employee_id, status, settlement_number FROM full_final_settlements WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!record) return notFound('Settlement');
    if (slugs.includes('admin') || slugs.includes('super_admin')) {
      await requireAllPermissions(['payroll.read']);
    } else if (slugs.includes('employer')) {
      await requireAllPermissions(['payroll.read']);
      if (Number(record.employer_id) !== Number(user.employerId)) return notFound('Settlement');
    } else if (Number(record.employee_id) !== Number(user.employeeId) || !['Approved', 'Paid'].includes(String(record.status))) {
      return notFound('Settlement');
    }
    const buffer = await generateFullFinalPdf(id, { generatedByName: user.fullName, generatedByRole: user.primaryRole });
    if (!buffer) return notFound('Settlement');
    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole, employerId: Number(record.employer_id), action: 'exported', module: 'payroll',
      entityType: 'full_final_settlement', entityId: id, entityLabel: String(record.settlement_number),
      description: `Full and final settlement ${String(record.settlement_number)} downloaded as PDF`, ipAddress: clientIp(request),
    });
    return pdfResponse(buffer, `full-final-${String(record.settlement_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/full-final/[settlementId]', method: 'GET' });
  }
}
