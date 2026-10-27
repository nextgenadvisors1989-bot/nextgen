/**
 * GET /api/employer/payroll/payslips/[payslipId]/pdf
 *
 * The bilingual payslip PDF for one of this company's employees. The scope check
 * happens before a single byte is rendered.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound } from '@/lib/utils/api-response';
import { getPayslip } from '@/services/payroll.service';
import { generatePayslipPdf, payslipFormat } from '@/lib/pdf/payslip-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const user = await requireEmployerApi(['payslip.download']);
    const { payslipId } = await params;
    const slip = await getPayslip(Number(payslipId), { employerId: Number(user.employerId ?? 0) || null });
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
        'Content-Disposition': `inline; filename="${String(slip.payslip_number).replace(/\//g, '-')}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/payslips/[payslipId]/pdf', method: 'GET' });
  }
}
