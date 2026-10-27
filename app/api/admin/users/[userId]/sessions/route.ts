/**
 * GET    /api/admin/users/[userId]/sessions — every sign-in for this login.
 * DELETE /api/admin/users/[userId]/sessions — revoke all active sessions.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getUserDetail, revokeSessionsForUser } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    await requireAdminApi(['user.read']);
    const detail = await getUserDetail(id);
    return ok(detail.sessions);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/sessions', method: 'GET' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const result = await revokeSessionsForUser(id, { user, ip: clientIp(request) });
    return ok(result, { message: `${result.revoked} session(s) revoked` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/sessions', method: 'DELETE' });
  }
}
