/**
 * GET /api/admin/cms/home — every block of the public home page as the editor shows it
 * (the saved text where there is one, the standard text otherwise).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getHomeEditorState } from '@/services/home-editor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['cms_page.read']);
    return ok(await getHomeEditorState());
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/home', method: 'GET' });
  }
}
