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
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats } from '@/components/compliance/shared';
import { ACT_STATUSES, JURISDICTIONS } from '@/lib/validations/compliance.validation';

interface ActRow {
  id: number;
  act_name: string;
  short_name: string | null;
  act_number: string | null;
  act_year: number | null;
  jurisdiction: string;
  state_name: string | null;
  ministry: string | null;
  department: string | null;
  employee_threshold: string | null;
  status: string;
  rule_count?: number;
  regulation_count?: number;
  notification_count?: number;
  document_count?: number;
}

export function ActsTable({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<ActRow>({
    endpoint: '/api/admin/compliance/acts',
    initialFilters: { search: '', jurisdiction: 'all', status: 'all' },
    initialSortBy: 'act_name',
    initialSortDir: 'asc',
  });
  const [pendingDelete, setPendingDelete] = useState<ActRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: Column<ActRow>[] = [
    {
      key: 'act',
      header: 'Act',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/acts/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.act_name, 60)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.act_number, row.act_year ? `Year ${row.act_year}` : null].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'jurisdiction',
      header: 'Jurisdiction',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.jurisdiction}
          {row.state_name ? ` — ${row.state_name}` : ''}
        </span>
      ),
    },
    {
      key: 'obligations',
      header: 'Obligations',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span className="flex items-center justify-center gap-2 text-ink-soft">
          <span title="Rules">{formatNumber(row.rule_count ?? 0)} rules</span>
          <span className="text-ink-muted">·</span>
          <span title="Regulations">{formatNumber(row.regulation_count ?? 0)} regs</span>
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Applicability',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.employee_threshold ?? '—', 34)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/compliance/acts/${row.id}`} className="btn-icon" title="View act" aria-label={`View ${row.act_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <Link href={`/admin/compliance/acts/${row.id}/edit`} className="btn-icon" title="Edit act" aria-label={`Edit ${row.act_name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove act"
              aria-label={`Remove ${row.act_name}`} onClick={() => setPendingDelete(row)}>
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
    const result = await api.delete<{ deleted: boolean }>(`/api/admin/compliance/acts/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Act removed', `${pendingDelete.act_name} is no longer in the register.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      // Dependants are named in the message, so the user knows what to clear first.
      errorToast('Could not remove act', result.message);
      setPendingDelete(null);
    }
  }

  const stats = list.extra.stats as Record<string, number> | undefined;

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Acts in the register', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Central and state legislation', tone: 'brand' },
          { label: 'Central legislation', value: formatNumber(stats?.central ?? 0), hint: 'Applicable nationwide', tone: 'info' },
          { label: 'State legislation', value: formatNumber(stats?.state ?? 0), hint: 'State-specific obligations', tone: 'info' },
          { label: 'Active', value: formatNumber(stats?.active ?? 0), hint: `${formatNumber(stats?.amended ?? 0)} amended`, tone: 'success' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by act name, number, ministry or summary…' },
            {
              key: 'jurisdiction', type: 'select', label: 'Jurisdiction',
              options: [{ value: 'all', label: 'All jurisdictions' }, ...JURISDICTIONS.map((value) => ({ value, label: value }))],
            },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...ACT_STATUSES.map((value) => ({ value, label: value }))],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `compliance-acts-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Act', 'Short name', 'Number', 'Year', 'Jurisdiction', 'State', 'Ministry', 'Threshold', 'Rules', 'Regulations', 'Status'],
                  list.data.map((row) => [
                    row.act_name, row.short_name, row.act_number, row.act_year, row.jurisdiction, row.state_name,
                    row.ministry, row.employee_threshold, row.rule_count ?? 0, row.regulation_count ?? 0, row.status,
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/compliance/acts/create" size="sm">Add Act</LinkButton>}
            </div>
          }
        />

        <DataTable<ActRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No acts found"
          emptySubtitle="Adjust the filters, or add the legislation your audits report against."
          emptyAction={canCreate ? <LinkButton href="/admin/compliance/acts/create" size="sm">Add Act</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this act from the register?"
        message={pendingDelete
          ? `${pendingDelete.act_name} will be removed. Acts that still carry rules, regulations, notifications or employer documents are refused — mark those repealed instead.`
          : ''}
        confirmLabel="Remove Act"
        variant="danger"
      />
    </div>
  );
}
