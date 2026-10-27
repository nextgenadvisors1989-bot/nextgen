/** POST /api/admin/users/[userId]/unlock — clear a login lockout. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { unlockUserAccount } from '@/services/user.service';

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
    const result = await unlockUserAccount(id, { user, ip: clientIp(request) });
    return ok(result, { message: 'Account unlocked — the user can sign in again' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/unlock', method: 'POST' });
  }
}
