/** GET /api/admin/capar/management - the checklist sections and documents, the auditors, and who is assigned to which document. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { getManagement, unassignedCount } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['capar.read']);
    return ok({ data: { ...(await getManagement()), unassigned: await unassignedCount() } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management', method: 'GET' });
  }
}
