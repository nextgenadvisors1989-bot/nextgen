/**
 * POST /api/admin/auditors/[auditorId]/login
 * Provisions (or re-issues) an auditor-portal login and returns the temporary
 * password so it can be handed over; the credentials email carries the
 * activation link as well.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { provisionAuditorLogin } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  try {
    const user = await requireAdminApi(['auditor.update']);
    const result = await provisionAuditorLogin(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor');

    return created(
      { credentials: result.credentials, emailSent: result.emailSent, warnings: result.warning ? [result.warning] : [] },
      'Auditor portal login created successfully'
    );
  } catch (error) {
    if ((error as { code?: string }).code === 'ALREADY_EXISTS') {
      return fail((error as Error).message, 409);
    }
    return handleRouteError(error, { route: '/api/admin/auditors/[auditorId]/login', method: 'POST' });
  }
}
