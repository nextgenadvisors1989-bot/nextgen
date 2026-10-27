/** POST /api/admin/settings/test/whatsapp — sends a real test WhatsApp message. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { whatsappTestSchema } from '@/lib/validations/setting.validation';
import { sendTestWhatsApp } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => ({}));
    const input = whatsappTestSchema.parse(body ?? {});
    const result = await sendTestWhatsApp({ to: input.to, message: input.message ?? null, actor: { user, ip: clientIp(request) } });
    if (!result.ok) return fail(result.message, 502, { code: 'DELIVERY_FAILED', ...result });
    return ok(result, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/test/whatsapp', method: 'POST' });
  }
}
