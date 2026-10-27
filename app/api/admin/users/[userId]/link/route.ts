/**
 * POST /api/admin/users/[userId]/link — bind a login to an employer, auditor or
 * employee record. The link is what scopes portal queries (an employer login
 * only ever reads its own company).
 */
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { linkUserToPortal } from '@/services/user.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const linkSchema = z.object({
  employer_id: z.coerce.number().int().positive().optional(),
  auditor_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
});

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const id = parseId((await params).userId);
  if (!id) return notFound('User');

  try {
    const user = await requireAdminApi(['user.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Choose a record to link', 400, { code: 'INVALID_JSON' });
    const input = linkSchema.parse(body);
    const result = await linkUserToPortal(id, input, { user, ip: clientIp(request) });
    return ok(result, { message: `Login linked to ${result.linked.join(', ')}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/users/[userId]/link', method: 'POST' });
  }
}
