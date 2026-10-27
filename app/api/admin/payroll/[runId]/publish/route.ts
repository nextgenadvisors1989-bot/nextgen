/**
 * POST /api/admin/payroll/[runId]/publish
 *
 * Publishes every payslip of the run to the employee it belongs to: the payslip
 * appears in the employee portal and the employee is told in-app, by email and —
 * where a mobile number is on record — by SMS and WhatsApp.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { publishPayslips } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireAdminApi(['payslip.update']);
    const { runId } = await params;
    const result = await publishPayslips(Number(runId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, {
      message: result.published
        ? `${result.published} payslip(s) published — ${result.deliveries.email} email(s), ${result.deliveries.sms} SMS, ${result.deliveries.whatsapp} WhatsApp`
        : 'Every payslip in this run had already been published',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/[runId]/publish', method: 'POST' });
  }
}
