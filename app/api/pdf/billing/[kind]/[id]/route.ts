/**
 * GET /api/pdf/billing/<quotation|invoice|receipt>/<id>
 * Administrators read any document; an employer reads only its own company's (never a Draft); everyone else is refused.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { generateInvoicePdf, generateQuotationPdf, generateReceiptPdf } from '@/lib/pdf/billing-pdf';
import { pdfResponse } from '@/lib/pdf/register-access';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp, handleRouteError, notFound } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id: rawId } = await params;
  const id = Number(rawId);
  if (!['quotation', 'invoice', 'receipt'].includes(kind) || !Number.isInteger(id) || id <= 0) return notFound('Document');
  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'employer']);
    await requireAllPermissions(['billing.read']);
    const isAdmin = user.roles.some((role) => role.slug === 'admin' || role.slug === 'super_admin');
    const scope = isAdmin ? {} : { employerId: Number(user.employerId ?? 0) || -1 };
    const context = { generatedByName: user.fullName };
    const buffer = kind === 'quotation' ? await generateQuotationPdf(id, scope, context) : kind === 'invoice' ? await generateInvoicePdf(id, scope, context) : await generateReceiptPdf(id, scope);
    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole, employerId: isAdmin ? null : Number(user.employerId ?? 0), action: 'exported', module: 'billing',
      entityType: kind, entityId: id, entityLabel: `${kind} ${id}`, description: `Billing ${kind} ${id} downloaded as PDF`, ipAddress: clientIp(request),
    });
    return pdfResponse(buffer, `${kind}-${id}.pdf`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/billing/[kind]/[id]', method: 'GET' });
  }
}
