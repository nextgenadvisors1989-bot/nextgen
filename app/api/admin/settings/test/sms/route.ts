/** POST /api/admin/settings/test/sms — sends a real test SMS (Twilio or MSG91). */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { smsTestSchema } from '@/lib/validations/setting.validation';
import { sendTestSms } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => ({}));
    const input = smsTestSchema.parse(body ?? {});
    const result = await sendTestSms({ to: input.to, message: input.message ?? null, actor: { user, ip: clientIp(request) } });
    if (!result.ok) return fail(result.message, 502, { code: 'DELIVERY_FAILED', ...result });
    return ok(result, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/test/sms', method: 'POST' });
  }
}
