/** POST /api/admin/capar/management/suggest - adds the auditors whose type suits each document (never removes anyone). */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { applySuggestions } from '@/services/capar-checklist.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await requireAdminApi(['capar.update']);
    return ok({ data: await applySuggestions(user.id) }, { message: 'Suggestions applied' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/capar/management/suggest', method: 'POST' });
  }
}
