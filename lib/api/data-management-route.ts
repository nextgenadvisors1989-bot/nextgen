/** Shared plumbing of the /api/data-management routes: who is calling, which company they mean, and uniform error handling. */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, handleRouteError, userAgent } from '@/lib/utils/api-response';
import type { Actor } from '@/services/data-management.service';

export const DM_PANELS = ['employer', 'employee', 'auditor', 'admin', 'super_admin'];

export const numberParam = (url: URL, name: string): number | null => {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
};

export async function withDataManagement(
  request: Request,
  route: { route: string; method: string },
  run: (ctx: { actor: Actor; url: URL; employerId: number | null }) => Promise<Response>
): Promise<Response> {
  try {
    const user = await requireApiPanel(DM_PANELS);
    const url = new URL(request.url);
    return await run({ actor: { user, ip: clientIp(request), userAgent: userAgent(request) }, url, employerId: numberParam(url, 'employer_id') });
  } catch (error) {
    return handleRouteError(error, route);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  return ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
}
