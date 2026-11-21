/**
 * GET /api/public/media/[fileId] — an image of the public website (the principal's photo), served to visitors who are not
 * signed in. Only files the CMS stored as public images are served (JPG, PNG, WebP; never SVG, which can carry script);
 * everything else in the document vault stays behind the signed-in download route.
 */
import { findFile, readFileBytes } from '@/lib/files/file-service';
import { handleRouteError, notFound } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = Number((await params).fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Image');
  try {
    const file = await findFile(id);
    const mime = String(file?.mime_type ?? '').toLowerCase();
    if (!file || file.access_level !== 'public' || String(file.entity_type) !== 'CMS_MEDIA' || file.is_archived || !IMAGE_TYPES.has(mime)) return notFound('Image');
    const bytes = await readFileBytes(file);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/public/media/[fileId]', method: 'GET' });
  }
}
