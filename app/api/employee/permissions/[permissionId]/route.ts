/** DELETE /api/employee/permissions/[permissionId] - withdraw one of your own requests while it is still pending. */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { cancelPermission } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ permissionId: string }> }) {
  try {
    const user = await requireEmployeeApi(['attendance.read']);
    const id = Number((await params).permissionId);
    if (!Number.isInteger(id) || id <= 0) return notFound('Permission request');
    await cancelPermission(Number(user.employeeId ?? 0), id);
    return ok({ data: { id } }, { message: 'Permission request withdrawn' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/permissions/[permissionId]', method: 'DELETE' });
  }
}
