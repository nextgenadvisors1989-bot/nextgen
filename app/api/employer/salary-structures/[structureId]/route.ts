/**
 * /api/employer/salary-structures/[structureId]
 *
 * GET    — one of this company's structures with its extra head lines.
 * PATCH  — revises it.
 * DELETE — removes it while no payslip depends on it.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { deleteStructure, getStructure, updateStructure } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    const user = await requireEmployerApi(['salary_structure.read']);
    const { structureId } = await params;
    return ok(await getStructure(Number(structureId), Number(user.employerId ?? 0) || null));
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/salary-structures/[structureId]', method: 'GET' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    const user = await requireEmployerApi(['salary_structure.update']);
    const { structureId } = await params;
    const result = await updateStructure(Number(structureId), await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: `Salary structure for ${result.employee_name} updated` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/salary-structures/[structureId]', method: 'PATCH' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ structureId: string }> }) {
  try {
    const user = await requireEmployerApi(['salary_structure.delete']);
    const { structureId } = await params;
    const result = await deleteStructure(Number(structureId), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, { employerId: Number(user.employerId ?? 0) || null });
    return ok(result, { message: 'Salary structure removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/salary-structures/[structureId]', method: 'DELETE' });
  }
}
