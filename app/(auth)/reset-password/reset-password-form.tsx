'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { validatePasswordStrength } from '@/lib/validations/password-policy';
import { ProgressBar } from '@/components/ui/progress-bar';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const strength = validatePasswordStrength(newPassword);
  const tones = ['red', 'amber', 'amber', 'emerald', 'emerald'] as const;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    const result = await api.post('/api/auth/reset-password', { token, newPassword, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setErrors(fieldErrors(result));
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login'), 2500);
  };

  if (!token) {
    return (
      <div className="card card-pad text-center">
        <h1 className="text-lg font-bold text-ink">Invalid reset link</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This password reset link is missing its token. Please request a new link.
        </p>
        <Link href="/forgot-password" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card card-pad animate-fade-up text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-ink">Password reset successfully</h1>
        <p className="mt-2 text-sm text-ink-muted">
          All active sessions have been signed out. Redirecting you to sign in…
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline">
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad animate-fade-up">
      <h1 className="text-xl font-bold text-ink">Set a new password</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Choose a strong password you haven&apos;t used before. You&apos;ll be signed out of all other devices.
      </p>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <div>
          <Input
            label="New Password"
            name="newPassword"
            type="password"
            required
            autoFocus
            value={newPassword}
            error={errors.newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          {newPassword && (
            <div className="mt-2 space-y-1.5">
              <ProgressBar value={strength.score * 25} tone={tones[strength.score]} height={6} showValue={false} />
              <p className="text-xs text-ink-muted">
                {strength.errors[0] ?? ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][strength.score]}
              </p>
            </div>
          )}
        </div>

        <Input
          label="Confirm New Password"
          name="confirmPassword"
          type="password"
          required
          value={confirmPassword}
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <Button type="submit" fullWidth loading={loading}>Reset Password</Button>
      </form>
    </div>
  );
}
