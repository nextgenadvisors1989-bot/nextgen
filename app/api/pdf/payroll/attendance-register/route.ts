/**
 * GET /api/pdf/payroll/attendance-register?employer_id=&month=&year= - who was present on which day.
 * Admins name the establishment; an employer always gets its own, whatever the URL says.
 */
import { fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { generateAttendanceRegisterPdf } from '@/lib/pdf/registers-pdf';
import { logRegisterDownload, pdfResponse, registerCaller } from '@/lib/pdf/register-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const caller = await registerCaller(request, 'attendance.read');
    const search = new URL(request.url).searchParams;
    const now = new Date();
    const month = Number(search.get('month') ?? now.getMonth() + 1);
    const year = Number(search.get('year') ?? now.getFullYear());
    if (!Number.isInteger(month) || month < 1 || month > 12) return fail('Month must be between 1 and 12', 422, { code: 'VALIDATION_FAILED' });
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Year is not valid', 422, { code: 'VALIDATION_FAILED' });
    if (!caller.employerId) return fail('Name the establishment (employer_id) for this register', 422, { code: 'VALIDATION_FAILED' });

    const buffer = await generateAttendanceRegisterPdf(caller.employerId, month, year, { generatedByName: caller.user.fullName, generatedByRole: caller.user.primaryRole });
    if (!buffer) return notFound('Establishment');
    await logRegisterDownload(request, caller, { module: 'attendance', entityType: 'employers', entityId: caller.employerId, label: `Attendance register ${month}/${year}`, employerId: caller.employerId });
    return pdfResponse(buffer, `attendance-register-${year}-${String(month).padStart(2, '0')}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/payroll/attendance-register', method: 'GET' });
  }
}
