/**
 * GET /api/admin/settings/logs/[channel] — the delivery log for one channel
 * (`email`, `sms` or `whatsapp`): every attempt the platform made, with its
 * template, provider, status, error and payload preview, plus the statistics and
 * the template breakdown the settings screens show next to the credentials.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { deliveryLogQuerySchema, deliveryChannelSchema } from '@/lib/validations/setting.validation';
import { getDeliveryLogs } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  try {
    await requireAdminApi(['settings.read']);
    const parsed = deliveryChannelSchema.safeParse((await params).channel);
    if (!parsed.success) return fail('Unknown delivery channel — use email, sms or whatsapp', 400, { code: 'VALIDATION_FAILED' });

    const filters = deliveryLogQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await getDeliveryLogs(parsed.data, filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, templates: result.templates, failures: result.failures, channel: parsed.data },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/logs/[channel]', method: 'GET' });
  }
}
