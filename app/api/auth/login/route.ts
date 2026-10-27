import { loginUser, setSessionCookies } from '@/lib/auth/auth';
import { loginSchema } from '@/lib/validations/auth.validation';
import { clientIp, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/**
 * POST /api/auth/login
 * Body: { identifier, password, rememberMe }
 * Effect: validates credentials, creates the session row, sets the session and
 * CSRF cookies, and returns the panel the user should land on.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    const result = await loginUser(input.identifier, input.password, input.rememberMe, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    if (!result.ok || !result.user || !result.session) {
      return fail(result.message, result.code === 'ACCOUNT_LOCKED' ? 429 : 401, { code: result.code });
    }

    await setSessionCookies(result.session.token, result.session.csrfToken, result.session.expiresAt);

    return ok(
      { user: result.user },
      {
        message: result.message,
        extra: {
          redirectTo: result.redirectTo,
          mustChangePassword: result.mustChangePassword ?? false,
        },
      }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/login', method: 'POST' });
  }
}
