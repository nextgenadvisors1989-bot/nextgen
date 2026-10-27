/**
 * GET /api/pdf/water-noc/[nocId] - the groundwater NOC compliance report as a PDF.
 * Scoped like the NOC itself: admins and Water auditors get any, an employer gets its own company's.
 */
import { notFound } from '@/lib/utils/api-response';
import { numericId, withWater } from '@/lib/api/water-route';
import { generateWaterNocPdf } from '@/lib/pdf/water-noc-pdf';
import { pdfResponse } from '@/lib/pdf/register-access';
import { getNocDetail, reportForDownload } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ nocId: string }> }) {
  const id = numericId((await params).nocId);
  if (!id) return notFound('Groundwater NOC');
  return withWater(request, { route: '/api/pdf/water-noc/[nocId]', method: 'GET' }, async (user, actor) => {
    const noc = await reportForDownload(actor, id);
    const detail = await getNocDetail(user, id);
    const buffer = await generateWaterNocPdf(detail, user.fullName);
    return pdfResponse(buffer, `groundwater-noc-${String(noc.noc_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
  });
}
