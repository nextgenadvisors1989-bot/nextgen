/** POST /api/admin/users/[userId]/reset-password — email a 1-hour reset link. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { sendUserPasswordReset } from '@/services/user.service';

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
    const result = await sendUserPasswordReset(id, { user, ip: clientIp(request) });
    return ok(result, { message: `Password reset link sent to ${result.emailedTo}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/reset-password', method: 'POST' });
  }
}
