/**
 * Password policy — pure, dependency-free and safe to import from client
 * components. The hashing layer lives in `lib/auth/password.ts`, which pulls in
 * bcrypt and therefore must never be imported into the browser bundle.
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 72, // bcrypt truncates beyond 72 bytes
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialCharacters: '!@#$%^&*()_+-=[]{};:,.<>?',
};

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4
  errors: string[];
  suggestions: string[];
}

export function validatePasswordStrength(password: string, personal: string[] = []): PasswordValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];

  if (!password) {
    return { valid: false, score: 0, errors: ['Password is required'], suggestions: [] };
  }
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must not exceed ${PASSWORD_POLICY.maxLength} characters`);
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) errors.push('Password must contain a number');

  if (PASSWORD_POLICY.requireSpecial) {
    const escaping = PASSWORD_POLICY.specialCharacters.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`[${escaping}]`).test(password)) {
      errors.push('Password must contain a special character (for example @, #, $ or !)');
    }
  }

  for (const value of personal) {
    if (!value || value.length < 3) continue;
    if (password.toLowerCase().includes(value.toLowerCase())) {
      errors.push('Password must not contain your name, email or username');
      break;
    }
  }

  if (/(.)\1{2,}/.test(password)) suggestions.push('Avoid repeating the same character three or more times');
  if (/^[A-Za-z]+[0-9]{1,4}$/.test(password)) suggestions.push('Avoid a word followed by a short number');

  let score = 0;
  if (password.length >= PASSWORD_POLICY.minLength) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) && password.length >= 10) score += 1;

  return { valid: errors.length === 0, score, errors, suggestions };
}
