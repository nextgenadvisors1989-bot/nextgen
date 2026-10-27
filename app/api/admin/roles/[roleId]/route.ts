/**
 * /api/admin/roles/[roleId]
 *
 * GET    — the role, its permission names, its members and the whole
 *          permission catalogue (the matrix screen loads it in one request).
 * PATCH  — rename/redescribe a custom role (system role names are fixed).
 * DELETE — remove a custom role that nobody holds.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { roleUpdateSchema } from '@/lib/validations/user.validation';
import { deleteRoleRecord, getRoleDetail, updateRoleRecord } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const id = parseId((await params).roleId);
  if (!id) return notFound('Role');

  try {
    await requireAdminApi(['role.read']);
    return ok(await getRoleDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles/[roleId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const id = parseId((await params).roleId);
  if (!id) return notFound('Role');

  try {
    const user = await requireAdminApi(['role.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the fields you want to change', 400, { code: 'INVALID_JSON' });
    const input = roleUpdateSchema.parse(body);
    const result = await updateRoleRecord(id, input, { user, ip: clientIp(request) });
    return ok(result, { message: `Role ${result.name} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles/[roleId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const id = parseId((await params).roleId);
  if (!id) return notFound('Role');

  try {
    const user = await requireAdminApi(['role.delete']);
    const result = await deleteRoleRecord(id, { user, ip: clientIp(request) });
    return ok(result, { message: `Role ${result.name} removed` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/roles/[roleId]', method: 'DELETE' });
  }
}
