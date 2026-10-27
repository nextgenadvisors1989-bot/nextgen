/**
 * Password hashing and generation — server only.
 *
 * This module imports bcrypt, so it must not be pulled into a client component.
 * The validation policy lives in `lib/validations/password-policy.ts` and is
 * re-exported here for server-side callers that want a single import.
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { PASSWORD_POLICY, validatePasswordStrength, type PasswordValidationResult } from '@/lib/validations/password-policy';

const BCRYPT_ROUNDS = 12;

export { PASSWORD_POLICY, validatePasswordStrength };
export type { PasswordValidationResult };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Generates a temporary password that satisfies the policy and is readable over
 * the phone. Ambiguous characters (0/O, 1/l/I) are excluded.
 */
export function generateTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  const pick = (set: string) => set[randomInt(0, set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  while (chars.length < length) chars.push(pick(all));

  // Fisher–Yates shuffle so the guaranteed characters aren't always up front.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Builds a unique username from a full name, e.g. "Ravi Kumar" -> ravi.kumar */
export function generateUsername(fullName: string, existing: Set<string> = new Set()): string {
  const parts = fullName
    .toLowerCase()
    .replace(/[^a-z\s.]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const base = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0] || 'user';
  if (!existing.has(base)) return base;
  let suffix = 1;
  while (existing.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}
