/**
 * /api/admin/payroll/structures/[structureId]
 *
 * GET    — one structure with its extra head lines.
 * PATCH  — corrects a structure that is still in force.
 * DELETE — removes a structure that has never produced a payslip; once a payslip
 *          exists the history is not editable and a new revision is required.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { deleteStructure, getStructure, updateStructure } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    await requireAdminApi(['salary_structure.read']);
    const { structureId } = await params;
    return ok(await getStructure(Number(structureId)));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/structures/[structureId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    const user = await requireAdminApi(['salary_structure.update']);
    const { structureId } = await params;
    const result = await updateStructure(Number(structureId), await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: `Salary structure for ${result.employee_name} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/structures/[structureId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    const user = await requireAdminApi(['salary_structure.delete']);
    const { structureId } = await params;
    const result = await deleteStructure(Number(structureId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return ok(result, { message: 'Salary structure removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/structures/[structureId]', method: 'DELETE' });
  }
}
