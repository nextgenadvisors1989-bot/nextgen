/**
 * GET /api/admin/settings — the settings overview.
 *
 * Returns every group with how much of it is configured, the scheduled jobs, the
 * settings statistics and which stored groups are not in the catalogue (so an
 * orphan row is visible instead of silently invisible).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getAllSettings, getSettingsOverview, integrationStatus } from '@/services/setting.service';
import { SETTINGS_SCREENS } from '@/lib/settings/definitions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['settings.read']);
    const [overview, values, integrations] = await Promise.all([
      getSettingsOverview(),
      getAllSettings(),
      integrationStatus(),
    ]);

    return ok({
      ...overview,
      screens: SETTINGS_SCREENS,
      integrations,
      values: Object.fromEntries(
        Object.entries(values).map(([group, list]) => [group, Object.fromEntries(list.map((entry) => [entry.key, entry.displayValue]))])
      ),
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings', method: 'GET' });
  }
}
