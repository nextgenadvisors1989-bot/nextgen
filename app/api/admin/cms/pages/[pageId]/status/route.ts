/**
 * POST /api/admin/cms/pages/[pageId]/status — the publishing actions:
 * publish, unpublish, schedule, archive and restore.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { cmsPageStatusSchema } from '@/lib/validations/cms.validation';
import { setPageStatus } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const id = Number(pageId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Page');
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const input = cmsPageStatusSchema.parse(await request.json());
    const result = await setPageStatus(id, input, { user, ip: clientIp(request), userAgent: userAgent(request) });
    const messages: Record<string, string> = {
      publish: 'Page published — it is live on the public site now',
      unpublish: 'Page unpublished — it has gone back to draft',
      schedule: `Page scheduled to publish on ${input.scheduled_at}`,
      archive: 'Page archived',
      restore: 'Page restored as a draft',
    };
    return ok(result, { message: messages[input.action] ?? 'Page updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/pages/[pageId]/status', method: 'POST' });
  }
}
