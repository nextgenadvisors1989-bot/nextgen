/**
 * GET /api/pdf/capar/[reportId] - the CAPAR report as a PDF.
 * Scoped like the report itself: an auditor gets their own, the assigned verifier gets theirs, an employer gets an approved
 * report about their company, an administrator gets any. An approved report prints only the findings found Eligible.
 */
import { fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { withCapar, numericId } from '@/lib/api/capar-route';
import { generateCaparPdf, loadCaparPdfInput } from '@/lib/pdf/capar-pdf';
import { pdfResponse } from '@/lib/pdf/register-access';
import { reportForDownload } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const id = numericId((await params).reportId);
  if (!id) return notFound('CAPAR report');
  return withCapar(request, { route: '/api/pdf/capar/[reportId]', method: 'GET' }, async (_user, actor) => {
    try {
      const report = await reportForDownload(actor, id);
      const input = await loadCaparPdfInput(id);
      if (!input) return notFound('CAPAR report');
      const buffer = await generateCaparPdf(input);
      return pdfResponse(buffer, `capar-${String(report.report_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
    } catch (error) {
      if ((error as { code?: string }).code) throw error;
      return handleRouteError(error, { route: '/api/pdf/capar/[reportId]', method: 'GET' }).then((response) => response ?? fail('Could not build the PDF', 500));
    }
  });
}
