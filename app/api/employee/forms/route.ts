/**
 * GET /api/employee/forms
 *
 * The dynamic modules and published forms this account may fill in: modules are
 * matched on the role's assignment or a direct user assignment, and archived or
 * unpublished modules never appear.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { availableModules } from '@/services/dynamic-module.service';
import { submissionStats } from '@/services/dynamic-submission.service';
import { actorFromUser } from '@/services/dynamic-submission.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployeeApi(['module.read', 'form.read']);
    const actor = actorFromUser(user, request);
    const [modules, stats] = await Promise.all([
      availableModules(user.id, user.primaryRole),
      submissionStats(actor),
    ]);
    return ok({ modules, stats });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/forms', method: 'GET' });
  }
}
