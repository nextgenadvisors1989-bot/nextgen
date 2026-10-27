/**
 * First-time account activation.
 *
 * Admin/employer onboarding issues a one-time activation token (stored hashed in
 * password_reset_tokens) alongside the temporary password emailed to the user.
 * Redeeming it lets the user pick their own username and password.
 */
import { randomBytes } from 'node:crypto';
import { execute, insert, queryOne } from '@/lib/db/mysql';
import { hashPassword, validatePasswordStrength } from './password';
import { hashToken } from './session';
import { writeActivityLog } from '@/lib/logger/activity-log';

export interface ActivateInput {
  token: string;
  username: string;
  password: string;
  confirmPassword: string;
  mobile?: string;
}

interface TokenRow {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  is_first_login: number;
}

export async function activateAccountWithToken(input: ActivateInput, ip?: string | null) {
  if (input.password !== input.confirmPassword) {
    return { ok: false as const, message: 'Passwords do not match' };
  }
  const strength = validatePasswordStrength(input.password);
  if (!strength.valid) {
    return { ok: false as const, message: strength.errors[0] ?? 'Password does not meet policy' };
  }

  const row = await queryOne<TokenRow>(
    `SELECT prt.id, prt.user_id, u.first_name, u.last_name, u.is_first_login
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW()
      LIMIT 1`,
    [hashToken(input.token)]
  );
  if (!row) {
    return { ok: false as const, message: 'This activation link is invalid or has expired. Ask your administrator to resend it.' };
  }

  const taken = await queryOne<{ id: number }>('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [
    input.username.trim().toLowerCase(),
    row.user_id,
  ]);
  if (taken) return { ok: false as const, message: 'That username is already taken. Please choose another.' };

  const passwordHash = await hashPassword(input.password);
  await execute(
    `UPDATE users
        SET username = ?, password_hash = ?, mobile = COALESCE(?, mobile), is_first_login = FALSE
      WHERE id = ?`,
    [input.username.trim().toLowerCase(), passwordHash, input.mobile || null, row.user_id]
  );
  await execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [row.id]);

  await writeActivityLog({
    userId: row.user_id,
    action: 'account_activated',
    module: 'auth',
    entityType: 'user',
    entityId: row.user_id,
    entityLabel: `${row.first_name} ${row.last_name}`,
    description: 'Account activated by the user via the emailed activation link',
    ipAddress: ip ?? null,
  });

  return { ok: true as const, message: 'Your account is active. Please sign in with your new password.' };
}

/** Issues an activation token; the caller emails the returned raw token. */
export async function createActivationToken(userId: number, validHours = 72) {
  const token = randomBytes(32).toString('hex');
  await insert(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [userId, hashToken(token), validHours]
  );
  return token;
}
