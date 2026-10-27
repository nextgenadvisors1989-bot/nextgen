/**
 * POST /api/admin/settings/test/email — sends a real test message through the
 * configured transport (or a simulated one when SMTP is not configured, which is
 * what the developer environment does). The outcome is written to email_logs and
 * to the activity log either way, so a failed test is as visible as a successful
 * one.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { emailTestSchema } from '@/lib/validations/setting.validation';
import { sendTestEmail } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => ({}));
    const input = emailTestSchema.parse(body ?? {});
    const result = await sendTestEmail({
      to: input.to ?? null,
      subject: input.subject ?? null,
      actor: { user, ip: clientIp(request) },
    });
    if (!result.ok) return fail(result.message, 502, { code: 'DELIVERY_FAILED', ...result });
    return ok(result, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/test/email', method: 'POST' });
  }
}
