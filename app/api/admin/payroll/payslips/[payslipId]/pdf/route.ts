/**
 * GET /api/admin/payroll/payslips/[payslipId]/pdf
 *
 * The bilingual payslip PDF, rendered on demand for the administrator. The
 * employee's own copy is served from the document vault once the run has been
 * published, so the file they download is the file that was issued.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound } from '@/lib/utils/api-response';
import { generatePayslipPdf, payslipFormat } from '@/lib/pdf/payslip-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const user = await requireAdminApi(['payslip.download']);
    const { payslipId } = await params;
    const buffer = await generatePayslipPdf(Number(payslipId), {
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
        'Content-Disposition': `inline; filename="payslip-${payslipId}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Generated-For': 'admin',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/payslips/[payslipId]/pdf', method: 'GET' });
  }
}
