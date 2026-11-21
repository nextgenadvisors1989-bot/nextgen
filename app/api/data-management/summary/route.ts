/** GET /api/data-management/summary?from&to&employer_id — KPIs, balances, ETP quality, exceptions and the GHG total of a period (default: the financial year so far). */
import { ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { summary } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/summary', method: 'GET' }, async ({ actor, url, employerId }) => {
    const { scope, ...result } = await summary(actor.user, employerId, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
    return ok({ ...result, company: scope.companyName, employerId: scope.employerId, can: { write: scope.canWrite, verify: scope.canVerify }, viewer: scope.viewer });
  });
}
