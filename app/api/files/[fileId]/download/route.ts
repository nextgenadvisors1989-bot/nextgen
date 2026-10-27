/**
 * GET /api/files/[fileId]/download
 *
 * Streams the stored blob back with the original filename, after the same
 * access check the metadata endpoint uses. Downloads are counted and written to
 * the activity log — a statutory document leaving the platform is an event the
 * auditor has to be able to see.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, handleRouteError, notFound, userAgent } from '@/lib/utils/api-response';
import { canAccessFile, findFile, readFileBytes, registerDownload } from '@/lib/files/file-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** RFC 5987 filename so Tamil and other non-ASCII names survive the header. */
function contentDisposition(name: string, disposition: 'inline' | 'attachment'): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const id = Number(fileId);
  if (!Number.isInteger(id) || id <= 0) return notFound('File');

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'employer', 'employee', 'auditor', 'verifier']);
    const file = await findFile(id);
    if (!file) return notFound('File');
    if (!(await canAccessFile(user, file))) {
      return notFound('File');
    }

    const bytes = await readFileBytes(file);
    await registerDownload(file, { user, ip: clientIp(request), userAgent: userAgent(request) });

    const inline = new URL(request.url).searchParams.get('inline') === 'true';
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': file.mime_type ?? 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Content-Disposition': contentDisposition(file.original_name, inline ? 'inline' : 'attachment'),
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/files/[fileId]/download', method: 'GET' });
  }
}
