'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Checkbox } from '@/components/ui/input';
import { api, fieldErrors } from '@/lib/utils/api-client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});

    const result = await api.post<{ redirectTo?: string }>('/api/auth/login', { identifier, password, rememberMe });

    if (!result.ok) {
      setError(result.message);
      setErrors(fieldErrors(result));
      setLoading(false);
      return;
    }

    const payload = result.raw as { redirectTo?: string; user?: { dashboardPath?: string } };
    const next = searchParams.get('next');
    const target = next || payload.redirectTo || payload.user?.dashboardPath || '/';
    router.push(target);
    router.refresh();
  };

  return (
    <div className="card card-pad animate-fade-up">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-xl font-bold text-white lg:hidden">C</div>
        <h1 className="text-xl font-bold text-ink">Sign in to your account</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter your credentials to access your panel</p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Username or Email"
          name="identifier"
          autoComplete="username"
          autoFocus
          required
          value={identifier}
          error={errors.identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="you@company.com"
          leftIcon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
        />

        <Input
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={password}
          error={errors.password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          leftIcon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
          rightIcon={
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-xs font-medium text-brand-600 hover:underline" tabIndex={-1}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
        />

        <div className="flex items-center justify-between">
          <Checkbox label="Remember me for 30 days" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth loading={loading} size="lg">
          {loading ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-muted">
        Access is restricted to authorised personnel. All sign-in attempts are logged.
      </p>
    </div>
  );
}
