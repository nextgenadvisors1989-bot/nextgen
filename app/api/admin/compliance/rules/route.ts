/**
 * GET  /api/admin/compliance/rules — the obligation register (filter by act, type,
 *                                    frequency, status)
 * POST /api/admin/compliance/rules — creates a rule under an act
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { ruleListQuerySchema } from '@/lib/validations/compliance.validation';
import { createRule, listRules } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_rule.read']);
    const filters = ruleListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listRules(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, actOptions: result.actOptions },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/rules', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['compliance_rule.create']);
    const result = await createRule(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `Rule “${result.ruleTitle}” created`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/rules', method: 'POST' });
  }
}
