/**
 * POST /api/admin/cms/jobs/run — runs the scheduled-publishing promotion now.
 *
 * The cron entry calls the same job; this endpoint exists so an editor who has
 * just scheduled a launch page can see it go live without waiting for the tick.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { runScheduledPublishing } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const result = await runScheduledPublishing({ user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, {
      message: result.published
        ? `${result.published} scheduled page(s) published`
        : 'Nothing was due — no scheduled page had reached its publishing moment',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/jobs/run', method: 'POST' });
  }
}
