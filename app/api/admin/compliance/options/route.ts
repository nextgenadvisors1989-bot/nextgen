/**
 * GET /api/admin/compliance/options — every register's lookups in one call
 * (acts, rules for an act, employers, units for an employer, types, statuses).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { actOptions, documentOptions, ruleOptions } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_document.read']);
    const params = parseSearchParams(request);
    const employerId = Number(params.get('employer_id') ?? 0) || null;
    const actId = Number(params.get('act_id') ?? 0) || null;
    const [options, acts, rules] = await Promise.all([
      documentOptions(employerId),
      actOptions(),
      ruleOptions(actId),
    ]);
    return ok({ ...options, actOptions: acts.length ? acts : options.actOptions, ruleOptions: rules });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/options', method: 'GET' });
  }
}
