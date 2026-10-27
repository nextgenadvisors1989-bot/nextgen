/**
 * POST /api/admin/auditors/[auditorId]/restore
 * Re-activates an archived auditor and, when one exists, their portal login.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { restoreAuditor } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  try {
    const user = await requireAdminApi(['auditor.update']);
    const result = await restoreAuditor(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor');
    return ok(result, { message: 'Auditor restored successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors/[auditorId]/restore', method: 'POST' });
  }
}
