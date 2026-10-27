'use client';

/**
 * The account half of every panel's settings screen: who the platform has you as,
 * the password you sign in with, and where your notification preferences live.
 *
 * Changing the password is the same call the first-login activation uses, so an
 * account still on its temporary password can be finished off from here too — the
 * panel does not have to know which situation it is in.
 */
import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

export interface AccountSettingsUser {
  id: number;
  fullName: string;
  email: string;
  username: string | null;
  mobile: string | null;
  primaryRole: string;
  roles: string[];
  lastLoginAt: string | null;
  dashboardPath: string;
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function AccountSettings({ user, notificationBasePath }: {
  user: AccountSettingsUser;
  /** Panel-scoped path of the notification register, e.g. `/employer/notifications`. */
  notificationBasePath?: string;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const response = await api.post<{ changed: boolean }>('/api/auth/change-password', form);
      if (!response.ok) {
        setErrors(fieldErrors(response.raw as never));
        toast.error(response.message);
        return;
      }
      toast.success(response.message || 'Password changed');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The password could not be changed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card padded={false}>
        <CardHeader
          title="Your account"
          description="Held by the platform. An administrator can correct it from the user register."
          action={<Badge tone="brand">{titleCase(user.primaryRole)}</Badge>}
        />
        <dl className="divide-y divide-line">
          {[
            { label: 'Name', value: user.fullName },
            { label: 'Email', value: user.email },
            { label: 'Username', value: user.username ?? '—' },
            { label: 'Mobile', value: user.mobile ?? '—' },
            { label: 'Roles', value: user.roles.map(titleCase).join(', ') || '—' },
            { label: 'Last sign-in', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never' },
          ].map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 px-6 py-3">
              <dt className="text-sm text-ink-muted">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
        {notificationBasePath ? (
          <div className="border-t border-line px-6 py-4">
            <LinkButton href={notificationBasePath} variant="outline" size="sm">Notification register</LinkButton>
          </div>
        ) : null}
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Password"
          description="Used for this account everywhere. Choose something you do not use anywhere else."
        />
        <form className="space-y-4 p-6" onSubmit={submit}>
          <Input
            type="password" label="Current password" autoComplete="current-password" required
            value={form.currentPassword} error={errors.currentPassword}
            onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
          />
          <Input
            type="password" label="New password" autoComplete="new-password" required
            helper="At least eight characters, with a number and a capital letter."
            value={form.newPassword} error={errors.newPassword}
            onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
          />
          <Input
            type="password" label="Confirm new password" autoComplete="new-password" required
            value={form.confirmPassword} error={errors.confirmPassword}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
