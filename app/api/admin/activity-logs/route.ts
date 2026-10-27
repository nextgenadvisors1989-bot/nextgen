/**
 * GET /api/admin/activity-logs
 *
 * The platform-wide audit trail. Two callers share it:
 *   · the record pages ask `?entityType=…&entityId=…&limit=25` for one record's
 *     own history;
 *   · the Activity Logs screen sends the full filter set and reads the facets,
 *     statistics and trend the response carries back.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { activityLogQuerySchema } from '@/lib/validations/audit-log.validation';
import { listActivityLogs } from '@/services/audit-log.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['activity_log.read']);
    const params = parseSearchParams(request);

    // The record pages use the lower-cased `entityType`/`entityId` spelling;
    // the screen uses the schema's snake_case. Accept both.
    const raw = Object.fromEntries(params);
    if (raw.entityType && !raw.entity_type) raw.entity_type = raw.entityType;
    if (raw.entityId && !raw.entity_id) raw.entity_id = raw.entityId;

    const filters = activityLogQuerySchema.parse(raw);
    const result = await listActivityLogs({
      ...filters,
      entityType: filters.entity_type ?? null,
      entityId: filters.entity_id ?? null,
      userId: filters.user_id ?? null,
      userRole: filters.user_role ?? null,
    });

    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: result.stats,
        options: result.options,
        trend: result.trend,
        leaderboard: result.leaderboard,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/activity-logs', method: 'GET' });
  }
}
