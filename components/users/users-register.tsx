'use client';

/**
 * Admin → Users.
 *
 * The login register: one row per account with the roles it holds, the portal
 * those roles open, whether it is locked or still waiting on its activation
 * link, and how many sessions are live right now. Filters mirror the questions
 * an administrator actually asks — who is an employer user, who is suspended,
 * who never signed in, who got themselves locked out.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { UserActionsPanel } from '@/components/users/user-actions';
import {
  Initials, PortalBadge, RoleChips, UserStats, UserStatusBadge,
  type UserRow, type UserStatTotals,
} from '@/components/users/shared';

interface RoleSummary {
  id: number;
  slug: string;
  name: string;
  isSystemRole: boolean;
  users: number;
  permissions: number;
}

export function UsersRegister({
  roleOptions,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: {
  roleOptions: { value: string; label: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const { success } = useToast();
  const [manageTarget, setManageTarget] = useState<UserRow | null>(null);
  const [archivedView, setArchivedView] = useState(false);

  const list = useList<UserRow>({
    endpoint: '/api/admin/users',
    initialFilters: {
      search: '', role: 'all', status: 'all', portal: 'all', locked: 'all',
      pending_activation: 'all', from_date: '', to_date: '', archived: 'all',
    },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const stats = list.extra.stats as Partial<UserStatTotals> | undefined;
  const byRole = (list.extra.byRole as RoleSummary[] | undefined) ?? [];

  const rows = list.data;

  function exportCsv() {
    downloadCsv(
      `complianceos-users-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Email', 'Username', 'Roles', 'Portal', 'Status', 'Locked', 'Pending activation', 'Live sessions', 'Last sign-in', 'Created'],
      rows.map((row) => [
        `${row.first_name} ${row.last_name}`,
        row.email,
        row.username,
        row.role_names ?? '',
        row.portal,
        row.deleted_at ? 'archived' : row.status,
        row.is_locked ? 'yes' : 'no',
        row.is_first_login ? 'yes' : 'no',
        row.active_sessions,
        row.last_login_at ?? '',
        row.created_at,
      ])
    );
    success(`${rows.length} row(s) exported to CSV`);
  }

  const columns: Column<UserRow>[] = [
    {
      key: 'account',
      header: 'Account',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Initials user={row} />
          <div className="min-w-0 max-w-[190px]">
            <Link href={`/admin/users/${row.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-600">
              {row.first_name} {row.last_name}
            </Link>
            <span className="block truncate text-[12px] text-ink-muted">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      hideOnMobile: true,
      render: (row) => <span className="block max-w-[130px] truncate font-mono text-[13px] text-ink-soft" title={String(row.username ?? '')}>{row.username}</span>,
    },
    {
      key: 'roles',
      header: 'Roles',
      hideOnMobile: true,
      render: (row) => <RoleChips names={row.role_names} />,
    },
    {
      key: 'portal',
      header: 'Portal',
      hideOnMobile: true,
      render: (row) => <PortalBadge portal={row.portal} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <UserStatusBadge user={row} />
          {Boolean(row.is_first_login) && !row.deleted_at && (
            <span className="text-[11px] text-amber-600">activation pending</span>
          )}
        </div>
      ),
    },
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span className={row.active_sessions ? 'text-sm font-medium text-emerald-600' : 'text-[13px] text-ink-muted'}>
          {formatNumber(row.active_sessions)}
        </span>
      ),
    },
    {
      key: 'last_login_at',
      header: 'Last sign-in',
      hideOnMobile: true,
      render: (row) =>
        row.last_login_at ? (
          <div>
            <p className="text-[13px] text-ink-soft">{formatDateTime(row.last_login_at)}</p>
            <p className="text-[11px] text-ink-muted">{row.last_login_ip ?? '—'}</p>
          </div>
        ) : (
          <span className="text-[13px] text-ink-muted">Never signed in</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/users/${row.id}`} className="btn-icon" title="Open account" aria-label={`Open ${row.email}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canEdit && !row.deleted_at && (
            <Link href={`/admin/users/${row.id}/edit`} className="btn-icon" title="Edit account" aria-label={`Edit ${row.email}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {(canEdit || canDelete) && (
            <button
              type="button"
              className="btn-icon"
              title="Manage account"
              aria-label={`Manage ${row.email}`}
              onClick={() => setManageTarget(row)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <UserStats stats={stats} />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search name, email, username or mobile' },
            {
              key: 'role', type: 'select', label: 'Role',
              options: [
                { value: 'all', label: 'Every role' },
                ...roleOptions,
                ...byRole
                  .filter((role) => !roleOptions.some((option) => option.value === role.slug))
                  .map((role) => ({ value: role.slug, label: `${role.name} (${role.users})` })),
              ],
            },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [
                { value: 'all', label: 'Every status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'locked', label: 'Locked out' },
              ],
            },
            {
              key: 'portal', type: 'select', label: 'Portal',
              options: [
                { value: 'all', label: 'Every portal' },
                { value: 'admin', label: 'Administration' },
                { value: 'auditor', label: 'Auditor' },
                { value: 'verifier', label: 'Verifier' },
                { value: 'employer', label: 'Employer' },
                { value: 'employee', label: 'Employee' },
                { value: 'unlinked', label: 'No portal' },
              ],
            },
            { key: 'from_date', type: 'date', label: 'Created from' },
            { key: 'to_date', type: 'date', label: 'Created to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <>
              <select
                className="focus-ring h-9 rounded-lg border border-line bg-white px-2 text-[13px] text-ink"
                value={list.filters.locked}
                onChange={(event) => list.setFilter('locked', event.target.value)}
                aria-label="Locked accounts"
              >
                <option value="all">Locked &amp; unlocked</option>
                <option value="true">Locked only</option>
                <option value="false">Not locked</option>
              </select>
              <select
                className="focus-ring h-9 rounded-lg border border-line bg-white px-2 text-[13px] text-ink"
                value={list.filters.pending_activation}
                onChange={(event) => list.setFilter('pending_activation', event.target.value)}
                aria-label="Activation state"
              >
                <option value="all">Activated &amp; pending</option>
                <option value="true">Activation pending</option>
                <option value="false">Activated</option>
              </select>
              <select
                className="focus-ring h-9 rounded-lg border border-line bg-white px-2 text-[13px] text-ink"
                value={archivedView ? 'archived' : 'live'}
                onChange={(event) => {
                  const archived = event.target.value === 'archived';
                  setArchivedView(archived);
                  list.setFilter('archived', archived ? 'true' : 'all');
                }}
                aria-label="Archived accounts"
              >
                <option value="live">Live accounts</option>
                <option value="archived">Archived accounts</option>
              </select>
            </>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">
            {formatNumber(list.pagination.total)} login account(s) · {formatNumber(stats?.sessions ?? 0)} live session(s) platform-wide
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
            )}
            {canCreate && <LinkButton href="/admin/users/create" size="sm">Create login</LinkButton>}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle={archivedView ? 'No archived accounts' : 'No login accounts match those filters'}
          emptySubtitle="Adjust the filters, or create a login for an employer, auditor or staff member."
          emptyAction={canCreate ? <LinkButton href="/admin/users/create" size="sm">Create login</LinkButton> : undefined}
        />

        <Pagination
          pagination={list.pagination}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      </Card>

      {list.error && <p className="text-sm text-red-600">{list.error}</p>}

      {manageTarget && (
        <Modal
          open
          onClose={() => setManageTarget(null)}
          title="Manage account"
          description={`${manageTarget.first_name} ${manageTarget.last_name} · ${manageTarget.email}`}
          size="lg"
        >
          <UserActionsPanel
            user={manageTarget}
            roleOptions={roleOptions}
            onChanged={() => { list.refresh(); setManageTarget(null); }}
          />
        </Modal>
      )}
    </div>
  );
}
