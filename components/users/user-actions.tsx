'use client';

/**
 * Everything an administrator can do to one login, in one place.
 *
 * The register opens this inside a modal and the account detail screen renders
 * it inline, so the two screens can never drift apart:
 *
 *   · roles       — replace the role set (revokes the user's sessions)
 *   · status      — activate / deactivate / suspend
 *   · unlock      — clear a failed sign-in lockout
 *   · password    — email a 1-hour reset link
 *   · activation  — re-issue a temporary password + 72-hour activation link
 *   · sessions    — revoke every live session
 *   · links       — bind the login to an employer / auditor / employee record
 *   · archive     — soft-delete the account (restore is offered instead)
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import type { UserRow } from '@/components/users/shared';

export interface RoleOption {
  value: string;
  label: string;
  description?: string;
}

export interface LinkCandidates {
  employers: { id: number; label: string }[];
  auditors: { id: number; label: string }[];
  employees: { id: number; label: string }[];
}

type PendingAction = 'unlock' | 'reset' | 'resend' | 'revoke' | 'archive' | 'restore' | null;

export function UserActionsPanel({
  user,
  roleOptions,
  linkCandidates,
  onChanged,
  compact,
}: {
  user: UserRow;
  roleOptions?: RoleOption[];
  linkCandidates?: LinkCandidates;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const { success, error: errorToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);

  const [roleSelection, setRoleSelection] = useState<string[]>(
    (user.role_slugs ?? '').split('|').filter(Boolean)
  );
  const [roleReason, setRoleReason] = useState('');
  const [linkSelection, setLinkSelection] = useState({ employer_id: '', auditor_id: '', employee_id: '' });

  const archived = Boolean(user.deleted_at);

  async function run(key: string, call: () => Promise<{ ok: boolean; message: string; data?: unknown }>, done?: (data: unknown) => void) {
    setBusy(key);
    try {
      const result = await call();
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message || 'Done');
      done?.(result.data);
      setPending(null);
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  const saveRoles = () =>
    run('roles', () => api.patch(`/api/admin/users/${user.id}/roles`, {
      role_slugs: roleSelection,
      ...(roleReason ? { reason: roleReason } : {}),
    }), () => { setRolesOpen(false); setRoleReason(''); });

  const saveLinks = () => {
    const payload: Record<string, number> = {};
    if (linkSelection.employer_id) payload.employer_id = Number(linkSelection.employer_id);
    if (linkSelection.auditor_id) payload.auditor_id = Number(linkSelection.auditor_id);
    if (linkSelection.employee_id) payload.employee_id = Number(linkSelection.employee_id);
    if (!Object.keys(payload).length) {
      errorToast('Choose an employer, auditor or employee record to link');
      return;
    }
    return run('links', () => api.post(`/api/admin/users/${user.id}/link`, payload), () => setLinksOpen(false));
  };

  const buttons: { key: PendingAction | 'roles' | 'links'; label: string; onClick: () => void; hidden?: boolean; variant?: 'primary' | 'outline' | 'danger' | 'ghost' }[] = [
    { key: 'roles', label: 'Roles', onClick: () => setRolesOpen(true), hidden: archived || !roleOptions?.length, variant: 'outline' },
    { key: 'links', label: 'Portal links', onClick: () => setLinksOpen(true), hidden: archived || !linkCandidates, variant: 'outline' },
    { key: 'unlock', label: 'Unlock account', onClick: () => setPending('unlock'), hidden: archived || !user.is_locked },
    { key: 'reset', label: 'Send password reset', onClick: () => setPending('reset'), hidden: archived },
    { key: 'resend', label: 'Resend activation', onClick: () => setPending('resend'), hidden: archived || !user.is_first_login },
    { key: 'revoke', label: 'Revoke sessions', onClick: () => setPending('revoke'), hidden: archived || !user.active_sessions },
    { key: 'archive', label: 'Archive account', onClick: () => setPending('archive'), hidden: archived, variant: 'danger' },
    { key: 'restore', label: 'Restore account', onClick: () => setPending('restore'), hidden: !archived, variant: 'success' as 'primary' },
  ];

  const visible = buttons.filter((button) => !button.hidden);

  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'space-y-4'}>
      {!compact && (
        <div>
          <p className="text-sm text-ink-soft">
            {archived
              ? 'This account is archived — restore it to sign the user back in.'
              : `${user.active_sessions} live session(s) · ${user.permission_count} effective permission(s) across ${
                  (user.role_names ?? '').split(',').filter(Boolean).length || 0
                } role(s).`}
          </p>
        </div>
      )}

      <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
        {visible.map((button) => (
          <Button
            key={button.key}
            size="sm"
            variant={(button.variant ?? 'outline') as 'primary' | 'outline' | 'danger' | 'ghost'}
            loading={busy === button.key}
            onClick={button.onClick}
          >
            {button.label}
          </Button>
        ))}
        {!visible.length && <p className="text-[13px] text-ink-muted">No actions available for this account.</p>}
      </div>

      {roleOptions && roleOptions.length > 0 && (
        <Modal
          open={rolesOpen}
          onClose={() => setRolesOpen(false)}
          title="Assign roles"
          description={`Roles decide what ${user.first_name} ${user.last_name} can do and which panel opens at sign-in. Saving revokes every live session.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setRolesOpen(false)}>Cancel</Button>
              <Button onClick={saveRoles} loading={busy === 'roles'} disabled={!roleSelection.length}>Save roles</Button>
            </>
          }
        >
          <div className="space-y-3">
            {roleOptions.map((option) => {
              const checked = roleSelection.includes(option.value);
              return (
                <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-line"
                    checked={checked}
                    onChange={() => setRoleSelection((current) =>
                      checked ? current.filter((slug) => slug !== option.value) : [...current, option.value])}
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    {option.description && <span className="mt-0.5 block text-[12px] text-ink-muted">{option.description}</span>}
                  </span>
                </label>
              );
            })}
            <div>
              <label className="label" htmlFor="role-reason">Reason (recorded in the audit trail)</label>
              <input
                id="role-reason"
                className="input"
                value={roleReason}
                maxLength={300}
                placeholder="e.g. moved from auditor to verifier duties"
                onChange={(event) => setRoleReason(event.target.value)}
              />
            </div>
            {!roleSelection.length && <p className="text-[12px] text-red-600">Keep at least one role.</p>}
          </div>
        </Modal>
      )}

      {linkCandidates && (
        <Modal
          open={linksOpen}
          onClose={() => setLinksOpen(false)}
          title="Portal links"
          description="A link scopes the login: an employer user only ever sees that company's data."
          footer={
            <>
              <Button variant="outline" onClick={() => setLinksOpen(false)}>Cancel</Button>
              <Button onClick={saveLinks} loading={busy === 'links'}>Save link</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="Employer" value={linkSelection.employer_id} searchable clearable
              options={[{ value: '', label: 'Not linked' }, ...linkCandidates.employers.map((row) => ({ value: String(row.id), label: row.label }))]}
              onChange={(value) => setLinkSelection((current) => ({ ...current, employer_id: value }))}
            />
            <Select
              label="Auditor" value={linkSelection.auditor_id} searchable clearable
              options={[{ value: '', label: 'Not linked' }, ...linkCandidates.auditors.map((row) => ({ value: String(row.id), label: row.label }))]}
              onChange={(value) => setLinkSelection((current) => ({ ...current, auditor_id: value }))}
            />
            <Select
              label="Employee" value={linkSelection.employee_id} searchable clearable
              options={[{ value: '', label: 'Not linked' }, ...linkCandidates.employees.map((row) => ({ value: String(row.id), label: row.label }))]}
              onChange={(value) => setLinkSelection((current) => ({ ...current, employee_id: value }))}
            />
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={pending === 'unlock'}
        onClose={() => setPending(null)}
        onConfirm={() => run('unlock', () => api.post(`/api/admin/users/${user.id}/unlock`))}
        title="Unlock this account?"
        message={`${user.first_name} ${user.last_name} will be able to sign in immediately. The failed attempt counter resets to zero.`}
        confirmLabel="Unlock" variant="primary" loading={busy === 'unlock'}
      />

      <ConfirmDialog
        open={pending === 'reset'}
        onClose={() => setPending(null)}
        onConfirm={() => run('reset', () => api.post(`/api/admin/users/${user.id}/reset-password`))}
        title="Send a password reset link?"
        message={`A single-use reset link valid for one hour will be emailed to ${user.email}. All existing sessions stay valid until the password is actually changed.`}
        confirmLabel="Send link" variant="primary" loading={busy === 'reset'}
      />

      <ConfirmDialog
        open={pending === 'resend'}
        onClose={() => setPending(null)}
        onConfirm={() => run('resend', () => api.post(`/api/admin/users/${user.id}/resend-activation`))}
        title="Re-send activation credentials?"
        message={`A new temporary password and a fresh 72-hour activation link will be emailed to ${user.email}. The previously issued password stops working.`}
        confirmLabel="Re-send" variant="primary" loading={busy === 'resend'}
      />

      <ConfirmDialog
        open={pending === 'revoke'}
        onClose={() => setPending(null)}
        onConfirm={() => run('revoke', () => api.delete(`/api/admin/users/${user.id}/sessions`))}
        title="Revoke every session?"
        message={`${user.active_sessions} live session(s) for ${user.email} will be signed out at once. The password is unchanged.`}
        confirmLabel="Revoke sessions" variant="warning" loading={busy === 'revoke'}
      />

      <ConfirmDialog
        open={pending === 'archive'}
        onClose={() => setPending(null)}
        onConfirm={() => run('archive', () => api.delete(`/api/admin/users/${user.id}`))}
        title="Archive this account?"
        message={`${user.email} will no longer be able to sign in, every session is revoked and the account disappears from the register. Nothing is deleted — the history stays and the account can be restored.`}
        confirmLabel="Archive account" variant="danger" loading={busy === 'archive'}
      />

      <ConfirmDialog
        open={pending === 'restore'}
        onClose={() => setPending(null)}
        onConfirm={() => run('restore', () => api.post(`/api/admin/users/${user.id}/restore`))}
        title="Restore this account?"
        message={`${user.email} becomes active again with its previous roles and links, and the lock clears.`}
        confirmLabel="Restore" variant="primary" loading={busy === 'restore'}
      />
    </div>
  );
}
