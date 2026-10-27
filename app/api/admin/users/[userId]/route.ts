/**
 * /api/admin/users/[userId]
 *
 * GET    — profile, roles, effective permissions, sessions, portal links,
 *          activity summary and the records this login could be bound to.
 * PATCH  — profile edit (name, email, username, mobile, photo, status).
 * DELETE — archive the account: soft delete, status set inactive and every
 *          session revoked.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { userUpdateSchema } from '@/lib/validations/user.validation';
import { archiveUserAccount, getUserDetail, updateUserRecord } from '@/services/user.service';

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
    return ok(await getUserDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the fields you want to change', 400, { code: 'INVALID_JSON' });
    const input = userUpdateSchema.parse(body);
    const result = await updateUserRecord(id, input, { user, ip: clientIp(request) });
    return ok(result, { message: `${result.name} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.delete']);
    const result = await archiveUserAccount(id, { user, ip: clientIp(request) });
    return ok(result, { message: 'Account archived and sessions revoked' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]', method: 'DELETE' });
  }
}
