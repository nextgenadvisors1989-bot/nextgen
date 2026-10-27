/**
 * GET /api/admin/settings/system — the System group: catalogue definitions,
 * current values (secrets masked) and, for the integration groups, the live
 * provider status and the delivery-log statistics.
 *
 * PUT /api/admin/settings/system — save the group. Every key is validated
 * against the catalogue, secrets are encrypted before they are stored, and the
 * change is written to the activity log with the old and new values.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { settingUpdateSchema } from '@/lib/validations/setting.validation';
import { getGroupSettings, integrationStatus, resetIntegrationCache, updateSettings } from '@/services/setting.service';
import { validateSettingPayload } from '@/lib/validations/setting.validation';
import type { SettingGroup } from '@/lib/settings/definitions';
import { deliveryStats } from '@/repositories/setting.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROUP: SettingGroup = 'system' as const;

export async function GET() {
  try {
    await requireAdminApi(['settings.read']);
    const detail = await getGroupSettings(GROUP);
    const extra = GROUP === 'email' || GROUP === 'sms' || GROUP === 'whatsapp'
      ? { delivery: await deliveryStats(GROUP), integrations: await integrationStatus() }
      : {};
    return ok({ ...detail, ...extra });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/system', method: 'GET' });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the settings you want to change', 400, { code: 'INVALID_JSON' });

    const input = settingUpdateSchema.parse(body);
    const result = await updateSettings(GROUP, input.values, input.note ?? null, { user, ip: clientIp(request) }, validateSettingPayload);
    // A change to an integration's credentials must not be served by a cached
    // connection pool that was opened with the old ones.
    await resetIntegrationCache(GROUP);

    return ok(result, { message: `${result.label} settings saved (${result.changed.length} field(s))` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/system', method: 'PUT' });
  }
}
