'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, fieldErrors } from '@/lib/utils/api-client';

/**
 * Token-based first-time activation for auditors and employees who received
 * credentials by email but have not yet signed in.
 */
export function ActivateAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [username, setUsername] = useState(searchParams.get('username') ?? '');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    const result = await api.post('/api/auth/activate-account', { token, username, mobile, password, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setErrors(fieldErrors(result));
      return;
    }
    router.push('/login?activated=1');
  };

  return (
    <div className="card card-pad animate-fade-up">
      <h1 className="text-xl font-bold text-ink">Activate your account</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Confirm your username, set a password and you&apos;re ready to sign in.
      </p>

      {!token && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          Your activation link is missing its token. Please use the link from your welcome email
          or contact your administrator.
        </div>
      )}

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Input
          label="Username"
          name="username"
          required
          value={username}
          error={errors.username}
          onChange={(event) => setUsername(event.target.value)}
          helper="You may keep the suggested username or choose your own."
        />
        <Input
          label="Mobile Number"
          name="mobile"
          value={mobile}
          error={errors.mobile}
          onChange={(event) => setMobile(event.target.value)}
          placeholder="+91 98765 43210"
          helper="Used for audit reminders over SMS and WhatsApp."
        />
        <Input
          label="New Password"
          name="password"
          type="password"
          required
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          required
          value={confirmPassword}
          error={errors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" fullWidth loading={loading} disabled={!token}>Activate Account</Button>
      </form>

      <Link href="/login" className="mt-5 block text-center text-sm font-medium text-brand-600 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
