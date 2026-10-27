/**
 * GET /api/admin/audit-assignments/options
 *
 *   ?lookups=true   → employers (+ units + departments), auditors with live
 *                     workload, verifier users and active dynamic modules
 *   ?stats=true     → the status counters shown above the register
 *   (no params)     → the register's status/priority/type enumerations
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { AUDIT_PRIORITIES, AUDIT_STATUSES } from '@/types/audit';
import { ASSIGNMENT_TYPES } from '@/lib/validations/audit-assignment.validation';
import { assignmentLookups, assignmentStats } from '@/services/audit-assignment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['audit_assignment.read']);
    const params = parseSearchParams(request);

    if (params.get('lookups') === 'true' || params.get('lookups') === '1') {
      const lookups = await assignmentLookups();
      return ok(lookups);
    }
    if (params.get('stats') === 'true') {
      const employerId = params.get('employerId');
      return ok(await assignmentStats(employerId ? Number(employerId) : undefined));
    }

    return ok({ statuses: AUDIT_STATUSES, priorities: AUDIT_PRIORITIES, types: ASSIGNMENT_TYPES });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-assignments/options', method: 'GET' });
  }
}
