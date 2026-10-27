/**
 * Shared plumbing for the /api/water-noc routes. The workspace guard lets admins, auditors and employers in; the service then
 * narrows it (Water auditors only, employers read-only and only their own company).
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, handleRouteError } from '@/lib/utils/api-response';
import type { Actor } from '@/services/water-noc.service';
import type { AuthUser } from '@/types/user';

export { missing, numericId, one, readUploads } from '@/lib/api/capar-route';

export const WATER_PANELS = ['admin', 'super_admin', 'auditor', 'employer'];

export async function withWater(
  request: Request,
  context: { route: string; method: string },
  handler: (user: AuthUser, actor: Actor) => Promise<Response>
): Promise<Response> {
  let userId: number | undefined;
  try {
    const user = await requireApiPanel(WATER_PANELS);
    userId = user.id;
    return await handler(user, { user, ip: clientIp(request) });
  } catch (error) {
    return handleRouteError(error, { ...context, userId, ip: clientIp(request) ?? undefined });
  }
}
