'use client';

/**
 * Users & Roles shared pieces.
 *
 * The register, the role grid and both detail screens render the same small
 * vocabulary — a portal chip, a status chip, a lock chip — so it lives here
 * rather than being re-implemented three times.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export interface UserRow {
  id: number;
  uuid: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  profile_photo: string | null;
  status: 'active' | 'inactive' | 'suspended';
  is_first_login: number | boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  role_slugs: string | null;
  role_names: string | null;
  role_ids: string | null;
  permission_count: number;
  portal: string;
  is_locked: number | boolean;
  can_sign_in: number | boolean;
  active_sessions: number;
}

export interface RoleRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_system_role: number | boolean;
  permissions: number;
  users: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionEntry {
  id: number;
  name: string;
  module: string;
  action: string;
  description: string | null;
}

export const PORTAL_LABELS: Record<string, string> = {
  admin: 'Administration',
  auditor: 'Auditor',
  verifier: 'Verifier',
  employer: 'Employer',
  employee: 'Employee',
  unlinked: 'No portal',
};

const PORTAL_TONES: Record<string, 'brand' | 'violet' | 'info' | 'success' | 'warning' | 'slate'> = {
  admin: 'brand',
  auditor: 'violet',
  verifier: 'info',
  employer: 'success',
  employee: 'warning',
  unlinked: 'slate',
};

export function PortalBadge({ portal }: { portal: string }) {
  return (
    <Badge tone={PORTAL_TONES[portal] ?? 'slate'}>{PORTAL_LABELS[portal] ?? portal}</Badge>
  );
}

export function UserStatusBadge({ user }: { user: Pick<UserRow, 'status' | 'locked_until' | 'is_locked' | 'deleted_at'> }) {
  if (user.deleted_at) return <Badge tone="slate" dot>Archived</Badge>;
  if (user.is_locked || (user.locked_until && new Date(user.locked_until) > new Date())) {
    return <Badge tone="danger" dot>Locked</Badge>;
  }
  const tone = user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'slate';
  const label = user.status === 'active' ? 'Active' : user.status === 'suspended' ? 'Suspended' : 'Inactive';
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function RoleChips({ names, max = 2 }: { names: string | null; max?: number }) {
  const list = (names ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  if (!list.length) return <span className="text-[13px] text-ink-muted">No role</span>;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((name) => (
        <Badge key={name} tone="slate">{name}</Badge>
      ))}
      {extra > 0 && <span className="text-[12px] text-ink-muted">+{extra} more</span>}
    </span>
  );
}

export function Initials({ user, size = 36 }: { user: Pick<UserRow, 'first_name' | 'last_name' | 'profile_photo'>; size?: number }) {
  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase();
  if (user.profile_photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.profile_photo}
        alt={`${user.first_name} ${user.last_name}`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-600"
      style={{ width: size, height: size }}
    >
      {initials || '—'}
    </span>
  );
}

export interface UserStatTotals {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  locked: number;
  pendingActivation: number;
  activeLast30: number;
  archived: number;
  sessions: number;
}

/** Headline tiles above the register. */
export function UserStats({ stats }: { stats?: Partial<UserStatTotals> }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Login accounts" value={formatNumber(stats?.total ?? 0)} tone="brand" />
      <StatCard label="Active" value={formatNumber(stats?.active ?? 0)} tone="emerald" hint={`${formatNumber(stats?.activeLast30 ?? 0)} signed in (30 days)`} />
      <StatCard label="Pending activation" value={formatNumber(stats?.pendingActivation ?? 0)} tone="amber" hint="Credentials issued, never signed in" />
      <StatCard label="Locked" value={formatNumber(stats?.locked ?? 0)} tone="red" hint="Failed sign-in lockouts" />
      <StatCard label="Live sessions" value={formatNumber(stats?.sessions ?? 0)} tone="violet" />
      <StatCard label="Archived" value={formatNumber(stats?.archived ?? 0)} tone="slate" />
    </div>
  );
}

export interface RoleStatTotals {
  total: number;
  systemRoles: number;
  customRoles: number;
  grants: number;
  permissions: number;
}

export function RoleStats({ stats, members = 0 }: { stats?: Partial<RoleStatTotals>; members?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Roles" value={formatNumber(stats?.total ?? 0)} tone="brand" hint={`${formatNumber(stats?.systemRoles ?? 0)} system · ${formatNumber(stats?.customRoles ?? 0)} custom`} />
      <StatCard label="Permissions" value={formatNumber(stats?.permissions ?? 0)} tone="violet" hint="Across every module" />
      <StatCard label="Grants" value={formatNumber(stats?.grants ?? 0)} tone="emerald" hint="Role → permission links" />
      <StatCard label="Assigned logins" value={formatNumber(members)} tone="slate" hint="Hold at least one role" />
    </div>
  );
}

/** Small labelled row used by the detail screens. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-44 shrink-0 text-[13px] font-medium text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function SessionRow({
  session,
}: {
  session: { id: number; ip_address: string | null; user_agent: string | null; created_at: string; expires_at: string };
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-ink">{session.ip_address ?? 'Unknown IP'}</p>
        <p className="text-[12px] text-ink-muted">{session.user_agent ?? 'Unknown client'}</p>
      </div>
      <div className="text-right text-[12px] text-ink-muted">
        <p>Started {formatDateTime(session.created_at)}</p>
        <p>Expires {formatDateTime(session.expires_at)}</p>
      </div>
    </div>
  );
}

export const PERMISSION_ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  export: 'Export',
  approve: 'Approve',
  reject: 'Reject',
  verify: 'Verify',
  share: 'Share',
  download: 'Download',
  upload: 'Upload',
};

export function moduleLabel(module: string): string {
  return module
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
