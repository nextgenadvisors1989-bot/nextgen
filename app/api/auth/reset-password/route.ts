import { resetPasswordWithToken } from '@/lib/auth/auth';
import { resetPasswordSchema } from '@/lib/validations/auth.validation';
import { handleRouteError, fail, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/** POST /api/auth/reset-password — consumes the single-use token. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = resetPasswordSchema.parse(body);

    const result = await resetPasswordWithToken(input.token, input.newPassword, input.confirmPassword);
    if (!result.ok) return fail(result.message, 400, { code: 'INVALID_TOKEN' });

    return ok({ reset: true }, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/reset-password', method: 'POST' });
  }
}
