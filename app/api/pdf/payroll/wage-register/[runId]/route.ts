/**
 * GET /api/pdf/payroll/wage-register/[runId] - the wage register of one payroll run as a PDF.
 * Admins read any run; an employer reads only its own (another company's run answers 404, like a missing one).
 */
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { handleRouteError, notFound } from '@/lib/utils/api-response';
import { generateWageRegisterPdf } from '@/lib/pdf/registers-pdf';
import { logRegisterDownload, pdfResponse, registerCaller } from '@/lib/pdf/register-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const caller = await registerCaller(request);
    const id = Number((await params).runId);
    if (!Number.isInteger(id) || id <= 0) return notFound('Payroll run');
    const run = await queryOne<RowDataPacket>('SELECT id, employer_id, run_number FROM payroll_runs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!run) return notFound('Payroll run');
    if (!caller.isAdmin && Number(run.employer_id) !== caller.employerId) return notFound('Payroll run');

    const buffer = await generateWageRegisterPdf(id, { generatedByName: caller.user.fullName, generatedByRole: caller.user.primaryRole, format: new URL(request.url).searchParams.get('format') === 'detailed' ? 'detailed' : 'rule-11-5' });
    if (!buffer) return notFound('Payroll run');
    await logRegisterDownload(request, caller, { module: 'payroll', entityType: 'payroll_run', entityId: id, label: `Wage register ${run.run_number}`, employerId: Number(run.employer_id) });
    return pdfResponse(buffer, `wage-register-${String(run.run_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/payroll/wage-register/[runId]', method: 'GET' });
  }
}
