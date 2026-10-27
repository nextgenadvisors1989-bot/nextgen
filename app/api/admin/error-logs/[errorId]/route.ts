/**
 * /api/admin/error-logs/[errorId]
 *
 * GET   — one error with its stack trace, request body and similar occurrences.
 * PATCH — resolve it or reopen it, with the note that explains the fix.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { resolveErrorSchema } from '@/lib/validations/audit-log.validation';
import { getErrorLog, resolveErrorLog } from '@/services/audit-log.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ errorId: string }> }) {
  const id = parseId((await params).errorId);
  if (!id) return notFound('Error log');

  try {
    await requireAdminApi(['activity_log.read']);
    return ok(await getErrorLog(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/error-logs/[errorId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ errorId: string }> }) {
  const id = parseId((await params).errorId);
  if (!id) return notFound('Error log');

  try {
    const user = await requireAdminApi(['activity_log.update']);
    const body = await request.json().catch(() => ({}));
    const input = resolveErrorSchema.parse(body ?? {});

    const result = await resolveErrorLog(id, input, { user, ip: clientIp(request) });
    return ok(result, {
      message: result.isResolved ? `Error #${id} marked resolved` : `Error #${id} reopened`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/error-logs/[errorId]', method: 'PATCH' });
  }
}
