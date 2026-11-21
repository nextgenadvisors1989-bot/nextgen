/** GET /api/data-management/series?register&granularity=day|week|month|year&from&to&employer_id — a register's totals for each day, week, month or financial year. */
import { fail, ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { series } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/series', method: 'GET' }, async ({ actor, url, employerId }) => {
    const granularity = (url.searchParams.get('granularity') ?? 'month') as 'day' | 'week' | 'month' | 'year';
    if (!['day', 'week', 'month', 'year'].includes(granularity)) return fail('Choose day, week, month or year', 422, { code: 'VALIDATION_FAILED' });
    const { scope, ...result } = await series(actor.user, employerId, url.searchParams.get('register') ?? '', granularity, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
    return ok({ ...result, company: scope.companyName });
  });
}
