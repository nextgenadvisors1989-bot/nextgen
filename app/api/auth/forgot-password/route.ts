import { createPasswordResetToken } from '@/lib/auth/auth';
import { forgotPasswordSchema } from '@/lib/validations/auth.validation';
import { clientIp, handleRouteError, ok } from '@/lib/utils/api-response';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { APP_URL, APP_NAME } from '@/lib/utils/constants';

export const runtime = 'nodejs';

/**
 * POST /api/auth/forgot-password
 * Always returns the same message so the endpoint cannot be used to enumerate
 * which email addresses have accounts.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const result = await createPasswordResetToken(email, clientIp(request));

    if (result) {
      const resetUrl = `${APP_URL}/reset-password?token=${result.token}`;
      await sendTemplateEmail({
        to: result.user.email,
        templateCode: 'auth.password_reset',
        data: {
          recipient_name: result.user.name,
          email: result.user.email,
          reset_url: resetUrl,
          ip_address: clientIp(request) ?? 'unknown',
          requested_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        },
        entityType: 'user',
        entityId: result.user.id,
      });

      // SMS OTP-style notice is sent separately by an operator action; email is authoritative.
      console.log(`[auth] password reset email queued for user ${result.user.id} on ${APP_NAME}`);
    }

    return ok(
      { emailSent: Boolean(result) },
      {
        message: 'If your email is registered with us, you will receive a password reset link shortly.',
      }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/forgot-password', method: 'POST' });
  }
}
