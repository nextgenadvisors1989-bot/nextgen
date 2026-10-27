/**
 * GET /api/public/resources/[slug]/file
 *
 * Streams a published resource's file straight from the document vault and counts
 * the download. Deliberately public: a resource published with
 * `requires_login = 0` is a lead magnet, and the vault access level on CMS media
 * is `public` for exactly that reason. Anything not published is a 404 here.
 */
import { fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { publishedResource, registerResourceDownload } from '@/services/cms.service';
import { findFile, readFileBytes } from '@/lib/files/file-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const resource = await publishedResource((await params).slug);
    if (!resource) return notFound('Resource');
    if (resource.external_url && !resource.file_id) {
      return fail(`This resource is a link — open ${resource.external_url} instead`, 409, { code: 'INVALID_STATE' });
    }
    if (!resource.file_id) return notFound('Resource file');

    const file = await findFile(resource.file_id);
    if (!file) return notFound('Resource file');

    const bytes = await readFileBytes(file);
    await registerResourceDownload(resource.id);

    const name = file.original_name ?? resource.file_name ?? 'resource';
    const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': file.mime_type ?? 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/public/resources/[slug]/file', method: 'GET' });
  }
}
