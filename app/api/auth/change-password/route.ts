import { changeUserPassword } from '@/lib/auth/auth';
import { changePasswordSchema } from '@/lib/validations/auth.validation';
import { requireUser } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { writeActivityLog } from '@/lib/logger/activity-log';

export const runtime = 'nodejs';

/** POST /api/auth/change-password — first-login activation and voluntary changes. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireUser();
    const input = changePasswordSchema.parse(body);

    const result = await changeUserPassword(user, input.currentPassword, input.newPassword, input.confirmPassword);
    if (!result.ok) return fail(result.message, 400, { code: 'PASSWORD_CHANGE_FAILED' });

    await writeActivityLog({
      userId: user.id,
      userName: user.fullName,
      userRole: user.primaryRole,
      action: 'password_changed',
      module: 'auth',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.fullName,
      description: user.isFirstLogin ? 'Account activated (first-login password change)' : 'Password changed from account menu',
      ipAddress: clientIp(request),
    });

    return ok({ changed: true }, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/change-password', method: 'POST', body, userId: undefined });
  }
}
