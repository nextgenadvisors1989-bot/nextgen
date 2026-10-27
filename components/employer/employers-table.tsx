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
import { EMPLOYER_INDUSTRIES, INDIAN_STATES, type Employer } from '@/types/employer';
import { downloadCsv } from '@/lib/utils/export';

export function EmployersTable({
  canCreate, canUpdate, canDelete,
}: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<Employer>({
    endpoint: '/api/admin/employers',
    initialFilters: { search: '', status: 'all', industry: 'all', state: 'all', dateFrom: '', dateTo: '' },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<Employer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: Column<Employer>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/employers/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.company_name, 40)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.employer_code}
            {row.industry_type ? ` · ${row.industry_type}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {[row.city, row.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Person',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{row.contact_person_name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{row.contact_person_mobile ?? row.mobile ?? row.email ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'center',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{formatNumber(row.employee_count ?? 0)}</span>,
    },
    {
      key: 'audits',
      header: 'Audits',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span className="flex items-center justify-center gap-1.5">
          <span className="text-ink-soft">{formatNumber(row.audit_count ?? 0)}</span>
          {Number(row.pending_audit_count ?? 0) > 0 && <Badge tone="warning">{row.pending_audit_count} open</Badge>}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Added',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{formatDate(row.created_at)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/employers/${row.id}`} className="btn-icon" title="View employer" aria-label={`View ${row.company_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <Link href={`/admin/employers/${row.id}/edit`} className="btn-icon" title="Edit employer" aria-label={`Edit ${row.company_name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Archive employer"
              aria-label={`Archive ${row.company_name}`} onClick={() => setPendingDelete(row)}>
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
    const result = await api.delete<{ archived: boolean }>(`/api/admin/employers/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Employer archived', `${pendingDelete.company_name} was archived. Its history is retained.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not archive employer', result.message);
    }
  }

  return (
    <>
      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by name, code, city, contact or mobile…' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
            },
            {
              key: 'industry', type: 'select', label: 'Industry',
              options: [{ value: 'all', label: 'All industries' }, ...EMPLOYER_INDUSTRIES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'state', type: 'select', label: 'State',
              options: [{ value: 'all', label: 'All states' }, ...INDIAN_STATES.map((value) => ({ value, label: value }))],
            },
            { key: 'dateFrom', type: 'date', label: 'Added from' },
            { key: 'dateTo', type: 'date', label: 'Added to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => downloadCsv(
                  `employers-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Company', 'Code', 'Industry', 'City', 'State', 'Contact', 'Mobile', 'Email', 'Employees', 'Status'],
                  list.data.map((row) => [
                    row.company_name, row.employer_code, row.industry_type, row.city, row.state,
                    row.contact_person_name, row.contact_person_mobile ?? row.mobile, row.email,
                    row.employee_count ?? 0, row.status,
                  ])
                )}
                disabled={list.data.length === 0}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/employers/create" size="sm">Add Employer</LinkButton>}
            </div>
          }
        />

        <DataTable<Employer>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No employers found"
          emptySubtitle="Adjust the filters above, or add your first employer to get started."
          emptyAction={canCreate ? <LinkButton href="/admin/employers/create" size="sm">Add Employer</LinkButton> : undefined}
        />

        <Pagination
          pagination={list.pagination}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Archive this employer?"
        message={pendingDelete
          ? `${pendingDelete.company_name} will be archived (soft-deleted). Employees, audits, payroll and documents are retained. Employers with audits in progress cannot be archived.`
          : ''}
        confirmLabel="Archive Employer"
        variant="danger"
      />
    </>
  );
}
