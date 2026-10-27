/**
 * GET    /api/admin/compliance/rules/[ruleId] — the obligation and the regulations under it
 * PUT    /api/admin/compliance/rules/[ruleId] — updates it
 * DELETE /api/admin/compliance/rules/[ruleId] — refused while regulations reference it
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteRule, getRuleDetail, updateRule } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ruleKey(params: Promise<{ ruleId: string }>) {
  const { ruleId } = await params;
  const id = Number(ruleId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const id = await ruleKey(params);
  if (!id) return notFound('Rule');
  try {
    await requireAdminApi(['compliance_rule.read']);
    return ok(await getRuleDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/rules/[ruleId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const id = await ruleKey(params);
  if (!id) return notFound('Rule');
  try {
    const user = await requireAdminApi(['compliance_rule.update']);
    const result = await updateRule(id, await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Rule updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/rules/[ruleId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const id = await ruleKey(params);
  if (!id) return notFound('Rule');
  try {
    const user = await requireAdminApi(['compliance_rule.delete']);
    const result = await deleteRule(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
    return ok(result, { message: 'Rule removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/rules/[ruleId]', method: 'DELETE' });
  }
}
