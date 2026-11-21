/** GET /api/data-management/factors — the approved emission factors (read by anyone who may see Data Management). */
import { ok } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { listFactors } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/factors', method: 'GET' }, async () => ok(await listFactors({ approvedOnly: true })));
}
