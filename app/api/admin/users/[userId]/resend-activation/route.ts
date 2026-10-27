/**
 * POST /api/admin/users/[userId]/resend-activation — issue a fresh temporary
 * password plus a new 72-hour activation link and email both to the user.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { resendUserActivation } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const result = await resendUserActivation(id, { user, ip: clientIp(request) });
    return ok(result, { message: `Activation credentials re-sent to ${result.emailedTo}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/resend-activation', method: 'POST' });
  }
}
