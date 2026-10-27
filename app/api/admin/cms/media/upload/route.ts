/**
 * POST /api/admin/cms/media/upload — multipart upload into the media library.
 *
 * The bytes go through the document vault first (checksummed, versioned, and
 * access-controlled), then the library row points at that vault file. Nothing is
 * stored twice and nothing bypasses the vault's validation.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, userAgent } from '@/lib/utils/api-response';
import { uploadMedia } from '@/services/cms.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['cms_media.upload']);

    // A body that is not a readable multipart form is the caller's mistake.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail('The upload could not be read — send the files as multipart/form-data', 400, {
        code: 'VALIDATION_FAILED',
      });
    }
    const entries = formData.getAll('files');
    const single = formData.get('file');
    const raw = entries.length ? entries : single ? [single] : [];
    const files = raw.filter((entry): entry is File => entry instanceof File);
    if (!files.length) return fail('Choose at least one file to upload', 400, { code: 'VALIDATION_FAILED' });

    const uploads = await Promise.all(
      files.map(async (file) => ({
        originalName: file.name,
        mimeType: file.type || null,
        data: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    };

    const result = await uploadMedia(
      uploads,
      {
        title: files.length === 1 ? text('title') ?? files[0].name.replace(/\.[^.]+$/, '') : null,
        folder: text('folder') ?? 'General',
        alt_text: text('alt_text'),
        caption: text('caption'),
        tags: text('tags'),
      },
      { user, ip: clientIp(request), userAgent: userAgent(request) }
    );

    return created(result, `${result.count} asset(s) added to the media library`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/cms/media/upload', method: 'POST' });
  }
}
