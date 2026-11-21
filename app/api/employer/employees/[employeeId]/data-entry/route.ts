/** PUT /api/employer/employees/[employeeId]/data-entry — { enabled } lets (or stops) this employee enter Data Management records. */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { execute, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const id = Number((await params).employeeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Employee');
  try {
    const user = await requireEmployerApi(['data_management.update']);
    const body = ((await request.json().catch(() => ({}))) ?? {}) as { enabled?: unknown };
    const row = await queryOne<RowDataPacket>('SELECT id, user_id, name FROM employees WHERE id = ? AND employer_id = ? AND deleted_at IS NULL', [id, user.employerId ?? 0]);
    if (!row) return notFound('Employee');
    const enabled = body.enabled === true || body.enabled === 'true' ? 1 : 0;
    if (enabled && !row.user_id) return fail('This employee has no login yet. Issue a self-service login first.', 422, { code: 'VALIDATION_FAILED' });
    await execute('UPDATE employees SET data_entry_enabled = ? WHERE id = ?', [enabled, id]);
    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole, employerId: user.employerId ?? null, action: 'updated', module: 'data_management', entityType: 'employee', entityId: id,
      entityLabel: String(row.name), description: `Data Management entry ${enabled ? 'switched on' : 'switched off'} for ${String(row.name)}`, ipAddress: clientIp(request),
    });
    return ok({ id, enabled: Boolean(enabled) }, { message: enabled ? 'This employee can now enter Data Management records' : 'This employee can no longer enter Data Management records' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/[employeeId]/data-entry', method: 'PUT' });
  }
}
