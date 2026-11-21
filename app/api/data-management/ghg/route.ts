/** GET /api/data-management/ghg?from&to&employer_id — Scope 1, 2 and 3 emissions line by line, with the factor used for each. */
import { ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { ghgReport } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/ghg', method: 'GET' }, async ({ actor, url, employerId }) => {
    const { scope, ...result } = await ghgReport(actor.user, employerId, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
    return ok({ ...result, company: scope.companyName });
  });
}
