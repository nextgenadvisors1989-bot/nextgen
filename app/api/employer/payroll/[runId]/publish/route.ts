/**
 * POST /api/employer/payroll/[runId]/publish
 *
 * Publishes the company's payslips to its employees and tells each of them in
 * the portal, by email, and by SMS and WhatsApp where a number is on record.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { getRun, publishPayslips } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireEmployerApi(['payslip.update']);
    const { runId } = await params;
    await getRun(Number(runId), Number(user.employerId ?? 0) || null);
    const result = await publishPayslips(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, {
      message: result.published
        ? `${result.published} payslip(s) published — ${result.deliveries.email} email(s), ${result.deliveries.sms} SMS, ${result.deliveries.whatsapp} WhatsApp`
        : 'Every payslip in this run had already been published',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/payroll/[runId]/publish', method: 'POST' });
  }
}
