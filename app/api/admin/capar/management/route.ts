/** GET /api/admin/capar/management - the six CAPAR categories and the checklist documents with the category each one is under. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getManagement } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['capar.read']);
    return ok({ data: await getManagement() });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management', method: 'GET' });
  }
}
