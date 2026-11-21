/** GET /api/data-management/registers — the register catalogue (fields, units, formulas) and what the caller may do. */
import { ok } from '@/lib/utils/api-response';
import { REGISTERS, REGISTER_GROUPS } from '@/lib/data-management/registers';
import { listFactors } from '@/services/data-management.service';
import { withDataManagement } from '@/lib/api/data-management-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/registers', method: 'GET' }, async ({ actor }) => {
    const slugs = actor.user.roles.map((role) => role.slug);
    const has = (p: string) => actor.user.permissions.includes('*') || actor.user.permissions.includes(p);
    const factors = (await listFactors({ approvedOnly: true })).map((f) => ({ ef_code: f.ef_code, name: f.name, scope: f.scope, category: f.category, unit: f.unit, activity_key: f.activity_key }));
    return ok({
      registers: REGISTERS, groups: REGISTER_GROUPS, factors,
      viewer: slugs.includes('employer') ? 'employer' : slugs.includes('employee') ? 'employee' : slugs.includes('auditor') ? 'auditor' : 'admin',
      can: { read: has('data_management.read'), write: has('data_management.create') && (slugs.includes('employer') || slugs.includes('employee')), verify: slugs.includes('employer') && has('data_management.verify'), export: has('data_management.export') || slugs.includes('employer') },
    });
  });
}
