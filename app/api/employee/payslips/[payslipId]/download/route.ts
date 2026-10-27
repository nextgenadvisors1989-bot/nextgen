/**
 * GET /api/employee/payslips/[payslipId]/download
 *
 * The employee's own bilingual payslip PDF. Only a published payslip of the
 * signed-in employee is served — the scope check runs before the renderer.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound } from '@/lib/utils/api-response';
import { getPayslip } from '@/services/payroll.service';
import { generatePayslipPdf, payslipFormat } from '@/lib/pdf/payslip-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const user = await requireEmployeeApi(['payslip.download']);
    const { payslipId } = await params;
    const slip = await getPayslip(Number(payslipId), { employeeId: Number(user.employeeId ?? 0) });
    if (!slip.is_published) return notFound('Payslip');
    const buffer = await generatePayslipPdf(Number(slip.id), {
      format: payslipFormat(new URL(request.url).searchParams.get('format')),
      generatedByName: user.fullName,
      generatedByRole: user.primaryRole,
    });
    if (!buffer) return notFound('Payslip');
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `attachment; filename="${String(slip.payslip_number).replace(/\//g, '-')}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/payslips/[payslipId]/download', method: 'GET' });
  }
}
