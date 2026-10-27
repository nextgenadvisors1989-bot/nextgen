import { activateAccountWithToken } from '@/lib/auth/activate';
import { activateAccountSchema } from '@/lib/validations/auth.validation';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/**
 * POST /api/auth/activate-account
 * Completes first-time onboarding for accounts created by an admin or employer:
 * claims the activation token, then sets the chosen username and password.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const input = activateAccountSchema.parse(body);
    const result = await activateAccountWithToken(input, clientIp(request));
    if (!result.ok) return fail(result.message, 400, { code: 'ACTIVATION_FAILED' });
    return ok({ activated: true }, { message: result.message });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/activate-account', method: 'POST', body });
  }
}
