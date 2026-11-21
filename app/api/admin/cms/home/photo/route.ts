/** POST /api/admin/cms/home/photo — uploads the principal's photo (multipart, field "file") and returns its address. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { uploadHomePhoto } from '@/services/home-editor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_page.update', 'cms_media.upload']);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail('Send the photo as multipart/form-data', 400, { code: 'VALIDATION_FAILED' });
    }
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Choose a photo to upload', 400, { code: 'VALIDATION_FAILED' });
    const result = await uploadHomePhoto(
      { originalName: file.name, mimeType: file.type || null, data: Buffer.from(await file.arrayBuffer()) },
      { user, ip: clientIp(request), userAgent: userAgent(request) }
    );
    return ok(result, { message: 'Photo uploaded — press Save to show it on the home page' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/home/photo', method: 'POST' });
  }
}
