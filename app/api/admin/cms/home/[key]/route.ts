/**
 * /api/admin/cms/home/[key]
 *
 * PUT    — saves one block of the home page (text, rows, photo, shown / hidden).
 * DELETE — puts the block back to the standard text.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { resetHomeBlock, saveHomeBlock } from '@/services/home-editor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const { key } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await saveHomeBlock(key, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: result.hidden ? 'Saved — this block is hidden on the home page' : 'Saved — the home page shows it now' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/home/[key]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireAdminApi(['cms_page.update']);
    const { key } = await params;
    const result = await resetHomeBlock(key, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Back to the standard text' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/home/[key]', method: 'DELETE' });
  }
}
