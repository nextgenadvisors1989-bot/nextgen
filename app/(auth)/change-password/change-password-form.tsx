'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { validatePasswordStrength } from '@/lib/validations/password-policy';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';

export function ChangePasswordForm({ isFirstLogin, userName }: { isFirstLogin: boolean; userName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const strength = validatePasswordStrength(newPassword);
  const tones = ['red', 'amber', 'amber', 'emerald', 'emerald'] as const;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    const result = await api.post('/api/auth/change-password', { currentPassword, newPassword, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setErrors(fieldErrors(result));
      return;
    }
    toast.success('Password changed', 'Your new password is now active.');
    router.push('/');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {isFirstLogin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Welcome, {userName}.</strong> For security you must replace the temporary password issued to you
          before you can use the platform.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</div>}

      <Input
        label={isFirstLogin ? 'Temporary Password' : 'Current Password'}
        name="currentPassword"
        type="password"
        required
        autoFocus
        value={currentPassword}
        error={errors.currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />

      <div>
        <Input
          label="New Password"
          name="newPassword"
          type="password"
          required
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

      <Button type="submit" fullWidth loading={loading}>
        {isFirstLogin ? 'Activate My Account' : 'Change Password'}
      </Button>
    </form>
  );
}
