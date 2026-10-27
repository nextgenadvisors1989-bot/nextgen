'use client';

/**
 * Admin → Users → one account.
 *
 * Everything about a login on one screen: who it is, what it can do (the
 * effective permissions resolved across every role it holds), where it is
 * signed in, which portal records it is bound to, and every action an
 * administrator can take on it.
 */
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime, formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { UserActionsPanel, type LinkCandidates, type RoleOption } from '@/components/users/user-actions';
import {
  DetailRow, Initials, PortalBadge, SessionRow, UserStatusBadge, moduleLabel, PERMISSION_ACTION_LABELS,
  type UserRow,
} from '@/components/users/shared';

export interface UserRoleEntry {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_system_role: number | boolean;
  assigned_at: string;
  permissions: number;
}

export interface UserPermissionEntry {
  module: string;
  action: string;
  name: string;
  description: string | null;
}

export interface UserLinkEntry {
  kind: string;
  id: number;
  label: string;
  extra: number | null;
}

export interface UserDetailPayload {
  user: UserRow & { last_login_ip: string | null };
  roles: UserRoleEntry[];
  permissions: UserPermissionEntry[];
  sessions: { id: number; ip_address: string | null; user_agent: string | null; created_at: string; expires_at: string }[];
  links: UserLinkEntry[];
  activity: { actions: number; logins: number; failures: number; lastAction: string | null };
  candidates: LinkCandidates;
}

export function UserDetail({
  payload,
  roleOptions,
  canEdit,
  canDelete,
}: {
  payload: UserDetailPayload;
  roleOptions: RoleOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { user, roles, permissions, sessions, links, activity } = payload;

  const modules = new Map<string, UserPermissionEntry[]>();
  for (const permission of permissions) {
    if (!modules.has(permission.module)) modules.set(permission.module, []);
    modules.get(permission.module)!.push(permission);
  }

  async function revokeAll() {
    const result = await api.delete(`/api/admin/users/${user.id}/sessions`);
    if (!result.ok) {
      errorToast(result.message);
      return;
    }
    success(result.message);
    router.refresh();
  }

  const header = (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Initials user={user} size={56} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{user.first_name} {user.last_name}</h2>
                <UserStatusBadge user={user} />
                <PortalBadge portal={user.portal} />
              </div>
              <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
              <p className="text-[13px] text-ink-muted">
                <span className="font-mono">{user.username}</span>
                {user.mobile ? ` · ${user.mobile}` : ''} · created {formatDate(user.created_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/admin/users" variant="ghost" size="sm">Back to register</LinkButton>
            {canEdit && !user.deleted_at && (
              <LinkButton href={`/admin/users/${user.id}/edit`} variant="outline" size="sm">Edit profile</LinkButton>
            )}
            <LinkButton href={`/admin/activity-logs?search=${encodeURIComponent(user.email)}`} variant="outline" size="sm">
              Activity history
            </LinkButton>
          </div>
        </div>

        <dl className="grid gap-x-8 sm:grid-cols-2">
          <DetailRow label="Roles">{roles.length ? roles.map((role) => role.name).join(', ') : 'No role assigned'}</DetailRow>
          <DetailRow label="Effective permissions">{formatNumber(user.permission_count)}</DetailRow>
          <DetailRow label="Live sessions">{formatNumber(user.active_sessions)}</DetailRow>
          <DetailRow label="Last sign-in">
            {user.last_login_at ? `${formatDateTime(user.last_login_at)}${user.last_login_ip ? ` · ${user.last_login_ip}` : ''}` : 'Never signed in'}
          </DetailRow>
          <DetailRow label="Activation">
            {user.is_first_login ? <Badge tone="warning">Pending — credentials issued, never signed in</Badge> : <Badge tone="success">Completed</Badge>}
          </DetailRow>
          <DetailRow label="Lockout">
            {user.is_locked
              ? <span className="text-red-600">Locked until {formatDateTime(user.locked_until)} ({user.failed_login_count} failed attempts)</span>
              : `Not locked${user.failed_login_count ? ` · ${user.failed_login_count} failed attempt(s)` : ''}`}
          </DetailRow>
          <DetailRow label="Archived">{user.deleted_at ? formatDateTime(user.deleted_at) : 'No'}</DetailRow>
          <DetailRow label="Last updated">{formatDateTime(user.updated_at)}</DetailRow>
        </dl>

        {(canEdit || canDelete) && (
          <div className="rounded-lg border border-line bg-surface-muted p-4">
            <p className="mb-3 text-[13px] font-medium text-ink-soft">Account actions</p>
            <UserActionsPanel
              user={user}
              roleOptions={roleOptions}
              linkCandidates={payload.candidates}
              onChanged={() => router.refresh()}
              compact
            />
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-5">
      {header}

      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <Card>
                <CardBody className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-line p-4">
                      <p className="text-[12px] uppercase tracking-wide text-ink-muted">Recorded actions</p>
                      <p className="mt-1 text-xl font-semibold text-ink">{formatNumber(activity?.actions ?? 0)}</p>
                      <p className="text-[12px] text-ink-muted">
                        Latest {activity?.lastAction ? formatDateTime(activity.lastAction) : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line p-4">
                      <p className="text-[12px] uppercase tracking-wide text-ink-muted">Successful sign-ins</p>
                      <p className="mt-1 text-xl font-semibold text-emerald-600">{formatNumber(activity?.logins ?? 0)}</p>
                      <p className="text-[12px] text-ink-muted">Logged in activity_logs</p>
                    </div>
                    <div className="rounded-lg border border-line p-4">
                      <p className="text-[12px] uppercase tracking-wide text-ink-muted">Failed attempts</p>
                      <p className="mt-1 text-xl font-semibold text-red-600">{formatNumber(activity?.failures ?? 0)}</p>
                      <p className="text-[12px] text-ink-muted">Each one is on the login-attempts screen</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-ink">Portal links</h3>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      A link scopes what the login can read. Unlinked staff logins see the platform; portal logins see one record.
                    </p>
                    <div className="mt-3 space-y-2">
                      {links.length === 0 && <p className="text-[13px] text-ink-muted">No portal links yet.</p>}
                      {links.map((link) => (
                        <div key={`${link.kind}-${link.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                          <div>
                            <p className="text-sm text-ink">{link.label}</p>
                            <p className="text-[12px] text-ink-muted">
                              {link.kind === 'employer' ? 'Employer' : link.kind === 'auditor' ? 'Auditor' : 'Employee'}
                              {link.kind === 'employer' && link.extra ? ' · primary contact' : ''}
                            </p>
                          </div>
                          <Link
                            href={
                              link.kind === 'employer' ? `/admin/employers/${link.id}`
                                : link.kind === 'auditor' ? `/admin/auditors/${link.id}`
                                : `/admin/employees/${link.id}`
                            }
                            className="text-[13px] text-brand-600 hover:underline"
                          >
                            Open record
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ),
          },
          {
            key: 'roles',
            label: 'Roles & permissions',
            badge: <Badge tone="slate">{roles.length}</Badge>,
            content: (
              <div className="space-y-5">
                <Card>
                  <CardBody className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">Assigned roles</h3>
                        <p className="mt-1 text-[13px] text-ink-muted">
                          The union of these roles' grants is what the API allows. Changing roles signs the user out.
                        </p>
                      </div>
                      <LinkButton href="/admin/roles" variant="outline" size="sm">Manage roles</LinkButton>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {roles.map((role) => (
                        <div key={role.id} className="rounded-lg border border-line p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">{role.name}</p>
                            <Badge tone={role.is_system_role ? 'brand' : 'slate'}>{role.is_system_role ? 'System' : 'Custom'}</Badge>
                          </div>
                          <p className="mt-1 text-[12px] text-ink-muted">{role.description ?? 'No description'}</p>
                          <p className="mt-2 text-[12px] text-ink-muted">
                            {formatNumber(role.permissions)} permission(s) · assigned {formatDate(role.assigned_at)}
                          </p>
                        </div>
                      ))}
                      {!roles.length && <p className="text-[13px] text-ink-muted">This login holds no role yet — assign one from the account actions above.</p>}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Effective permissions</h3>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        {formatNumber(permissions.length)} distinct permission(s), resolved across every assigned role.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {[...modules.entries()].map(([module, entries]) => (
                        <div key={module} className="rounded-lg border border-line p-3">
                          <p className="text-[13px] font-medium text-ink-soft">{moduleLabel(module)}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {entries.map((entry) => (
                              <Badge key={entry.name} tone="slate">{PERMISSION_ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!permissions.length && <p className="text-[13px] text-ink-muted">No permissions yet.</p>}
                    </div>
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            key: 'sessions',
            label: 'Sessions',
            badge: <Badge tone={sessions.length ? 'success' : 'slate'}>{sessions.length}</Badge>,
            content: (
              <Card>
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Live sessions</h3>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        Sessions are revoked automatically when the password changes, the account is archived or a role is reassigned.
                      </p>
                    </div>
                    {canEdit && sessions.length > 0 && (
                      <Button size="sm" variant="danger" onClick={revokeAll}>Revoke all sessions</Button>
                    )}
                  </div>
                  <div>
                    {sessions.map((session) => <SessionRow key={session.id} session={session} />)}
                    {!sessions.length && <p className="text-[13px] text-ink-muted">No live sessions.</p>}
                  </div>
                </CardBody>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
