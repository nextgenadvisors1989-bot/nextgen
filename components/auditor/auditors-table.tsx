'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { INDIAN_STATES } from '@/types/employer';
import { AUDITOR_SPECIALIZATIONS, type Auditor } from '@/types/auditor';
import type { AuditorListRow } from '@/repositories/auditor.repository';

export function AuditorsTable({
  auditorTypes, employers, permissions,
}: {
  auditorTypes: { value: string; label: string }[];
  employers: { value: string; label: string }[];
  permissions: { create: boolean; update: boolean; remove: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<AuditorListRow>({
    endpoint: '/api/admin/auditors',
    initialFilters: {
      search: '', status: 'all', auditorTypeId: 'all', specialization: 'all',
      state: 'all', employerId: 'all', availability: 'all', dateFrom: '', dateTo: '',
    },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<AuditorListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: Column<AuditorListRow>[] = [
    {
      key: 'auditor',
      header: 'Auditor',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/auditors/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.name, 32)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.auditor_code}
            {row.role_title ? ` · ${row.role_title}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type & Specialisation',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{row.auditor_type_name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{row.specialization ?? 'General'}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{row.mobile ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{truncate(row.email, 28)}</span>
        </div>
      ),
    },
    {
      key: 'experience',
      header: 'Experience',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.experience_years === null || row.experience_years === undefined
            ? '—'
            : `${Number(row.experience_years)} yr`}
        </span>
      ),
    },
    {
      key: 'workload',
      header: 'Workload',
      align: 'center',
      render: (row) => {
        const open = Number(row.pending_assignments ?? 0);
        const max = Number(row.max_concurrent_audits ?? 5);
        const overdue = Number(row.overdue_assignments ?? 0);
        return (
          <span className="flex flex-col items-center gap-1">
            <Badge tone={open === 0 ? 'success' : open >= max ? 'danger' : 'warning'}>
              {open}/{max} open
            </Badge>
            {overdue > 0 && <Badge tone="danger">{overdue} overdue</Badge>}
          </span>
        );
      },
    },
    {
      key: 'note',
      header: 'Rating',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.rating === null || row.rating === undefined ? '—' : `${Number(row.rating).toFixed(1)}/5`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <StatusBadge status={row.status} />
          {Boolean(row.user_id) && <Badge tone="brand">login</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/auditors/${row.id}`} className="btn-icon" title="View auditor" aria-label={`View ${row.name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {permissions.update && (
            <Link href={`/admin/auditors/${row.id}/edit`} className="btn-icon" title="Edit auditor" aria-label={`Edit ${row.name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {permissions.remove && (
            <button type="button" className="btn-icon btn-icon-danger" title="Archive auditor"
              aria-label={`Archive ${row.name}`} onClick={() => setPendingDelete(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/admin/auditors/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Auditor archived', `${pendingDelete.name} was archived and their portal login deactivated.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not archive auditor', result.message);
    }
  }

  return (
    <>
      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by name, code, email, city or specialisation…' },
            { key: 'auditorTypeId', type: 'select', label: 'Auditor Type',
              options: [{ value: 'all', label: 'All types' }, ...auditorTypes] },
            { key: 'specialization', type: 'select', label: 'Specialisation',
              options: [{ value: 'all', label: 'All specialisations' }, ...AUDITOR_SPECIALIZATIONS.map((s) => ({ value: s, label: s }))] },
            { key: 'employerId', type: 'select', label: 'Assigned Employer',
              options: [{ value: 'all', label: 'All employers' }, ...employers] },
            { key: 'state', type: 'select', label: 'State',
              options: [{ value: 'all', label: 'All states' }, ...INDIAN_STATES.map((s) => ({ value: s, label: s }))] },
            { key: 'availability', type: 'select', label: 'Availability',
              options: [
                { value: 'all', label: 'All auditors' },
                { value: 'available', label: 'Has capacity for more audits' },
              ] },
            { key: 'status', type: 'select', label: 'Status',
              options: [
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ] },
            { key: 'dateFrom', type: 'date', label: 'Added from' },
            { key: 'dateTo', type: 'date', label: 'Added to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `auditors-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Auditor Code', 'Name', 'Email', 'Mobile', 'Type', 'Specialisation', 'Experience (yrs)', 'Open', 'Approved', 'Overdue', 'Status'],
                  list.data.map((row) => [
                    row.auditor_code, row.name, row.email, row.mobile, row.auditor_type_name,
                    row.specialization, Number(row.experience_years ?? 0),
                    Number(row.pending_assignments ?? 0), Number(row.completed_assignments ?? 0),
                    Number(row.overdue_assignments ?? 0), row.status,
                  ])
                )}>
                Export CSV
              </Button>
              {permissions.create && <LinkButton href="/admin/auditors/create" size="sm">Add Auditor</LinkButton>}
            </div>
          }
        />

        <DataTable<AuditorListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No auditors found"
          emptySubtitle="Adjust the filters above, or register your first auditor to start assigning audits."
          emptyAction={permissions.create ? <LinkButton href="/admin/auditors/create" size="sm">Add Auditor</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Archive this auditor?"
        message={pendingDelete
          ? `${truncate(pendingDelete.name, 40)} will be archived and removed from assignment planning. Audits they completed stay on record. Archive is refused while open assignments exist.`
          : ''}
        confirmLabel="Archive Auditor"
        variant="danger"
      />

      {pendingDelete && Number(pendingDelete.pending_assignments ?? 0) > 0 && (
        <p className="px-1 text-xs text-amber-700">
          {pendingDelete.name} still has {formatNumber(pendingDelete.pending_assignments)} open assignment(s) — reassign or cancel them first.
        </p>
      )}
    </>
  );
}
