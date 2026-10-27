/** PATCH /api/admin/users/[userId]/status — activate, deactivate or suspend a login. */
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { updateUserRecord } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statusSchema = z.object({ status: z.enum(['active', 'inactive', 'suspended']) });

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the new status', 400, { code: 'INVALID_JSON' });
    const input = statusSchema.parse(body);
    const result = await updateUserRecord(id, { status: input.status }, { user, ip: clientIp(request) });
    return ok(result, { message: `${result.name} is now ${input.status}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/status', method: 'PATCH' });
  }
}
