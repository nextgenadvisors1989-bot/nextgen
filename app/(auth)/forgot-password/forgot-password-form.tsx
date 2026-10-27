'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, fieldErrors } from '@/lib/utils/api-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await api.post('/api/auth/forgot-password', { email });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setErrors(fieldErrors(result));
      return;
    }
    setMessage(result.message);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="card card-pad animate-fade-up text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-ink">Check your email</h1>
        <p className="mt-2 text-sm text-ink-muted">{message}</p>
        <p className="mt-4 text-xs text-ink-muted">
          The reset link expires in 60 minutes. If you don&apos;t see the email, check your spam folder.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card card-pad animate-fade-up">
      <h1 className="text-xl font-bold text-ink">Forgot your password?</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Enter the email address registered with your account and we&apos;ll send you a secure reset link.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Input
          label="Registered Email"
          name="email"
          type="email"
          required
          autoFocus
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
        />
        <Button type="submit" fullWidth loading={loading}>Send Reset Link</Button>
      </form>

      <Link href="/login" className="mt-5 block text-center text-sm font-medium text-brand-600 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
