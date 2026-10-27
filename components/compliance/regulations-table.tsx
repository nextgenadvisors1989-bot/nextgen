'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats, type LookupOption } from '@/components/compliance/shared';
import { INSTRUMENT_STATUSES } from '@/lib/validations/compliance.validation';

interface RegulationRow {
  id: number;
  act_id: number | null;
  act_name?: string | null;
  act_short_name?: string | null;
  regulation_name: string;
  regulation_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  effective_date: string | null;
  reporting_authority: string | null;
  reporting_frequency: string | null;
  status: string;
}

export function RegulationsTable({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<RegulationRow>({
    endpoint: '/api/admin/compliance/regulations',
    initialFilters: { search: '', act_id: 'all', status: 'all' },
    initialSortBy: 'regulation_name',
    initialSortDir: 'asc',
  });
  const [pendingDelete, setPendingDelete] = useState<RegulationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const actOptions = (list.extra.actOptions as LookupOption[] | undefined) ?? [];
  const stats = list.extra.stats as Record<string, number> | undefined;

  const columns: Column<RegulationRow>[] = [
    {
      key: 'regulation',
      header: 'Instrument',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/regulations/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.regulation_name, 55)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.regulation_number, row.act_short_name ?? row.act_name].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'authority',
      header: 'Issued by',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.issuing_authority ?? '—', 34)}</span>,
    },
    {
      key: 'dates',
      header: 'In force',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.effective_date ? formatDate(row.effective_date) : '—'}
          {row.issue_date ? <span className="block text-xs text-ink-muted">issued {formatDate(row.issue_date)}</span> : null}
        </span>
      ),
    },
    {
      key: 'reporting',
      header: 'Reporting',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {truncate(row.reporting_authority ?? '—', 28)}
          {row.reporting_frequency ? <span className="block text-xs text-ink-muted">{row.reporting_frequency}</span> : null}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/compliance/regulations/${row.id}`} className="btn-icon" title="View instrument" aria-label={`View ${row.regulation_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <Link href={`/admin/compliance/regulations/${row.id}/edit`} className="btn-icon" title="Edit instrument" aria-label={`Edit ${row.regulation_name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove instrument"
              aria-label={`Remove ${row.regulation_name}`} onClick={() => setPendingDelete(row)}>
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
    const result = await api.delete(`/api/admin/compliance/regulations/${pendingDelete.id}`);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      success('Instrument removed', `${pendingDelete.regulation_name} was removed from the register.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not remove the instrument', result.message);
    }
  }

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Instruments', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Rules, schemes and orders', tone: 'brand' },
          { label: 'Active', value: formatNumber(stats?.active ?? 0), hint: 'Currently in force', tone: 'success' },
          { label: 'With reporting duty', value: formatNumber(stats?.reporting ?? 0), hint: 'Periodic returns owed', tone: 'warning' },
          { label: 'Superseded', value: formatNumber(stats?.superseded ?? 0), hint: `${formatNumber(stats?.upcoming ?? 0)} commence later`, tone: 'danger' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by name, number, authority or obligation…' },
            {
              key: 'act_id', type: 'select', label: 'Act',
              options: [{ value: 'all', label: 'All acts' }, ...actOptions.map((option) => ({ value: option.value, label: option.label }))],
            },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...INSTRUMENT_STATUSES.map((value) => ({ value, label: value }))],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `compliance-regulations-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Instrument', 'Number', 'Act', 'Issued by', 'Issue date', 'In force from', 'Reporting authority', 'Reporting frequency', 'Status'],
                  list.data.map((row) => [
                    row.regulation_name, row.regulation_number, row.act_name, row.issuing_authority,
                    row.issue_date, row.effective_date, row.reporting_authority, row.reporting_frequency, row.status,
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/compliance/regulations/create" size="sm">Add Instrument</LinkButton>}
            </div>
          }
        />

        <DataTable<RegulationRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No instruments found"
          emptySubtitle="Adjust the filters, or record the rules and schemes issued under each act."
          emptyAction={canCreate ? <LinkButton href="/admin/compliance/regulations/create" size="sm">Add Instrument</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this instrument?"
        message={pendingDelete ? `${pendingDelete.regulation_name} will be removed from the register.` : ''}
        confirmLabel="Remove Instrument"
        variant="danger"
      />
    </div>
  );
}
