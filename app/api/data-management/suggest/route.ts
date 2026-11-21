/** GET /api/data-management/suggest?register&employer_id — values already used in the register (materials, suppliers, products ...) to pick from. */
import { ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { suggestions } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/suggest', method: 'GET' }, async ({ actor, url, employerId }) =>
    ok({ suggestions: await suggestions(actor.user, employerId, url.searchParams.get('register') ?? '') }));
}
