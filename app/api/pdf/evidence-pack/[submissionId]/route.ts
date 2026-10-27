/**
 * GET /api/pdf/evidence-pack/[submissionId] - an employer's submitted document pack as a PDF.
 * An employer gets its own, an administrator any, an auditor the sections the administrator gave it (the download is recorded,
 * which is what lets the auditor start a CAPAR for that company).
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { clientIp, handleRouteError, notFound } from '@/lib/utils/api-response';
import { numericId } from '@/lib/api/capar-route';
import { generateEvidencePackPdf } from '@/lib/pdf/evidence-pack-pdf';
import { pdfResponse } from '@/lib/pdf/register-access';
import { evidenceRoleOf, submissionForPdf } from '@/services/evidence.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const id = numericId((await params).submissionId);
  if (!id) return notFound('Submission');
  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'auditor', 'employer']);
    await requireAllPermissions(['evidence.download']);
    const actor = { user, role: evidenceRoleOf(user), ip: clientIp(request) };
    const data = await submissionForPdf(actor, id, true);
    const buffer = await generateEvidencePackPdf({ ...data, preparedFor: user.fullName });
    return pdfResponse(buffer, `document-pack-${data.submission.company_name.replace(/[^a-zA-Z0-9]+/g, '-')}-${data.submission.submitted_at.slice(0, 10)}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/evidence-pack/[submissionId]', method: 'GET' });
  }
}
