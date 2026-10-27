'use client';

/**
 * Admin → Roles.
 *
 * The role register: system roles (which anchor the panels and cannot be
 * renamed or deleted) sit alongside custom roles an administrator has created.
 * Each row shows how many logins hold the role and how many permissions it
 * grants, and the whole set can be exported.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { RoleStats, type RoleRow, type RoleStatTotals } from '@/components/users/shared';

export function RolesTable({
  canCreate,
  canEdit,
  canDelete,
  canExport,
  systemRoles,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  systemRoles: { slug: string; name: string; description: string }[];
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<RoleRow>({
    endpoint: '/api/admin/roles',
    initialFilters: { search: '', kind: 'all' },
    initialSortBy: 'name',
    initialSortDir: 'asc',
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState({ name: '', slug: '', description: '', clone_from: '' });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);

  const stats = list.extra.stats as Partial<RoleStatTotals> | undefined;
  const members = list.data.reduce((total, role) => total + Number(role.users ?? 0), 0);

  async function createRole() {
    setSaving(true);
    setCreateErrors({});
    try {
      const result = await api.post<{ roleId: number; name: string }>('/api/admin/roles', {
        name: createValues.name,
        ...(createValues.slug ? { slug: createValues.slug } : {}),
        ...(createValues.description ? { description: createValues.description } : {}),
        ...(createValues.clone_from ? { clone_from: createValues.clone_from } : {}),
      });
      if (!result.ok) {
        setCreateErrors(fieldErrors(result));
        errorToast(result.message);
        return;
      }
      success(result.message);
      setCreateOpen(false);
      setCreateValues({ name: '', slug: '', description: '', clone_from: '' });
      router.push(`/admin/roles/${result.data?.roleId}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      const result = await api.delete(`/api/admin/roles/${pendingDelete.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPendingDelete(null);
      list.refresh();
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-roles-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Role', 'Slug', 'Type', 'Logins', 'Permissions', 'Description', 'Created'],
      list.data.map((role) => [
        role.name,
        role.slug,
        role.is_system_role ? 'system' : 'custom',
        role.users,
        role.permissions,
        role.description ?? '',
        role.created_at,
      ])
    );
    success(`${list.data.length} role(s) exported`);
  }

  const columns: Column<RoleRow>[] = [
    {
      key: 'name',
      header: 'Role',
      render: (row) => (
        <div>
          <Link href={`/admin/roles/${row.id}`} className="text-sm font-medium text-ink hover:text-brand-600">{row.name}</Link>
          <p className="font-mono text-[12px] text-ink-muted">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge tone={row.is_system_role ? 'brand' : 'slate'}>{row.is_system_role ? 'System' : 'Custom'}</Badge>
      ),
    },
    {
      key: 'users',
      header: 'Logins',
      align: 'center',
      render: (row) => (
        <Link href={`/admin/users?role=${row.slug}`} className="text-sm text-brand-600 hover:underline">
          {formatNumber(row.users)}
        </Link>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      align: 'center',
      render: (row) => <span className="text-sm text-ink-soft">{formatNumber(row.permissions)}</span>,
    },
    {
      key: 'description',
      header: 'Purpose',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{row.description ?? '—'}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{formatDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/roles/${row.id}`} className="btn-icon" title="Open role" aria-label={`Open ${row.name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          <Link href={`/admin/permissions?role=${row.slug}`} className="btn-icon" title="Edit permissions" aria-label={`Permissions for ${row.name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </Link>
          {canEdit && !row.is_system_role && (
            <Link href={`/admin/roles/${row.id}/edit`} className="btn-icon" title="Rename role" aria-label={`Rename ${row.name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && !row.is_system_role && (
            <button
              type="button"
              className="btn-icon btn-icon-danger"
              title="Delete role"
              aria-label={`Delete ${row.name}`}
              onClick={() => setPendingDelete(row)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <RoleStats stats={stats} members={members} />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search role name, slug or purpose' },
            {
              key: 'kind', type: 'select', label: 'Type',
              options: [
                { value: 'all', label: 'System & custom' },
                { value: 'system', label: 'System roles' },
                { value: 'custom', label: 'Custom roles' },
              ],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">{formatNumber(list.pagination.total)} role(s) define what the platform's logins may do.</p>
          <div className="flex flex-wrap items-center gap-2">
            {canExport && <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.data.length}>Export CSV</Button>}
            <LinkButton href="/admin/permissions" size="sm" variant="outline">Permission matrix</LinkButton>
            {canCreate && <Button size="sm" onClick={() => setCreateOpen(true)}>Create role</Button>}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No roles match that filter"
          emptySubtitle="System roles are created by the platform; custom roles by you."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <Card>
        <div className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-ink">System roles</h3>
          <p className="text-[13px] text-ink-muted">
            These six roles ship with the platform. Their slugs drive panel routing and permission defaults, so they
            cannot be renamed or deleted — clone one to get an editable copy.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {systemRoles.map((role) => (
              <div key={role.slug} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium text-ink">{role.name}</p>
                <p className="mt-1 text-[12px] text-ink-muted">{role.description}</p>
                <p className="mt-2 font-mono text-[11px] text-ink-muted">{role.slug}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a role"
        description="Name the role and pick what it may do. Cloning copies an existing role's grants as a starting point."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createRole} loading={saving}>Create role</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Role name" required value={createValues.name}
            error={createErrors.name} placeholder="e.g. Payroll Officer"
            onChange={(event) => setCreateValues((current) => ({ ...current, name: event.target.value }))}
          />
          <Input
            label="Slug" value={createValues.slug}
            error={createErrors.slug} placeholder="payroll_officer"
            helper="Lowercase letters, numbers and underscores. Generated from the name when left blank."
            onChange={(event) => setCreateValues((current) => ({ ...current, slug: event.target.value }))}
          />
          <Input
            label="Purpose" value={createValues.description}
            error={createErrors.description} placeholder="Runs monthly payroll and exports payslips"
            onChange={(event) => setCreateValues((current) => ({ ...current, description: event.target.value }))}
          />
          <div>
            <label className="label" htmlFor="clone-from">Clone permissions from</label>
            <select
              id="clone-from"
              className="input"
              value={createValues.clone_from}
              onChange={(event) => setCreateValues((current) => ({ ...current, clone_from: event.target.value }))}
            >
              <option value="">Start empty</option>
              {list.data.map((role) => <option key={role.slug} value={role.slug}>{role.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteRole}
        title={`Delete ${pendingDelete?.name ?? 'role'}?`}
        message="The role disappears from the register. A role that is still held by somebody cannot be deleted — move those logins first."
        confirmLabel="Delete role"
        loading={saving}
      />
    </div>
  );
}
