/**
 * GET /api/pdf/payroll/leave-register?employer_id=&year= - every employee's leave account for the year.
 * Admins name the establishment; an employer always gets its own.
 */
import { fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { generateLeaveRegisterPdf } from '@/lib/pdf/registers-pdf';
import { logRegisterDownload, pdfResponse, registerCaller } from '@/lib/pdf/register-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const caller = await registerCaller(request, 'leave.read');
    const year = Number(new URL(request.url).searchParams.get('year') ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail('Year is not valid', 422, { code: 'VALIDATION_FAILED' });
    if (!caller.employerId) return fail('Name the establishment (employer_id) for this register', 422, { code: 'VALIDATION_FAILED' });

    const buffer = await generateLeaveRegisterPdf(caller.employerId, year, { generatedByName: caller.user.fullName, generatedByRole: caller.user.primaryRole });
    if (!buffer) return notFound('Establishment');
    await logRegisterDownload(request, caller, { module: 'leave', entityType: 'employers', entityId: caller.employerId, label: `Leave register ${year}`, employerId: caller.employerId });
    return pdfResponse(buffer, `leave-register-${year}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/payroll/leave-register', method: 'GET' });
  }
}
