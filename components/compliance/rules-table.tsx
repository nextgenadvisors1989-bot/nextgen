'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats, type LookupOption } from '@/components/compliance/shared';
import { COMPLIANCE_FREQUENCIES, COMPLIANCE_TYPES, RULE_STATUSES } from '@/lib/validations/compliance.validation';

interface RuleRow {
  id: number;
  act_id: number;
  act_name?: string;
  act_short_name?: string | null;
  rule_number: string | null;
  rule_title: string;
  rule_text: string | null;
  compliance_type: string;
  frequency: string | null;
  due_day_of_month: number | null;
  responsible_role: string | null;
  status: string;
  regulation_count?: number;
}

export function RulesTable({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<RuleRow>({
    endpoint: '/api/admin/compliance/rules',
    initialFilters: { search: '', act_id: 'all', compliance_type: 'all', frequency: 'all', status: 'all' },
    initialSortBy: 'rule_title',
    initialSortDir: 'asc',
  });
  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const actOptions = (list.extra.actOptions as LookupOption[] | undefined) ?? [];
  const stats = list.extra.stats as Record<string, number> | undefined;

  const columns: Column<RuleRow>[] = [
    {
      key: 'rule',
      header: 'Obligation',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/rules/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.rule_title, 60)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.rule_number, row.act_short_name ?? row.act_name].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'frequency',
      header: 'Frequency',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.frequency ?? 'Ad hoc'}
          {row.due_day_of_month ? <span className="block text-xs text-ink-muted">due on day {row.due_day_of_month}</span> : null}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => (
        <Badge tone={row.compliance_type === 'Mandatory' ? 'warning' : 'default'}>{row.compliance_type}</Badge>
      ),
    },
    {
      key: 'owner',
      header: 'Responsible',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.responsible_role ?? '—', 30)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/compliance/rules/${row.id}`} className="btn-icon" title="View obligation" aria-label={`View ${row.rule_title}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <Link href={`/admin/compliance/rules/${row.id}/edit`} className="btn-icon" title="Edit obligation" aria-label={`Edit ${row.rule_title}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove obligation"
              aria-label={`Remove ${row.rule_title}`} onClick={() => setPendingDelete(row)}>
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
    const result = await api.delete(`/api/admin/compliance/rules/${pendingDelete.id}`);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      success('Obligation removed', `${pendingDelete.rule_title} was removed from the register.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not remove the obligation', result.message);
    }
  }

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Obligations', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Rules across every act', tone: 'brand' },
          { label: 'Mandatory', value: formatNumber(stats?.mandatory ?? 0), hint: 'Legally binding duties', tone: 'warning' },
          { label: 'Periodic', value: formatNumber(stats?.periodic ?? 0), hint: 'Recurring with a due day', tone: 'info' },
          { label: 'Active', value: formatNumber(stats?.active ?? 0), hint: 'Live obligations', tone: 'success' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by title, number, penalty or evidence…' },
            {
              key: 'act_id', type: 'select', label: 'Act',
              options: [{ value: 'all', label: 'All acts' }, ...actOptions.map((option) => ({ value: option.value, label: option.label }))],
            },
            {
              key: 'compliance_type', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...COMPLIANCE_TYPES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'frequency', type: 'select', label: 'Frequency',
              options: [{ value: 'all', label: 'All frequencies' }, ...COMPLIANCE_FREQUENCIES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...RULE_STATUSES.map((value) => ({ value, label: value }))],
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
                  `compliance-obligations-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Obligation', 'Number', 'Act', 'Type', 'Frequency', 'Due day', 'Responsible', 'Penalty', 'Status'],
                  list.data.map((row) => [
                    row.rule_title, row.rule_number, row.act_name, row.compliance_type,
                    row.frequency ?? 'Ad hoc', row.due_day_of_month ?? '', row.responsible_role,
                    row.rule_text, row.status,
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/compliance/rules/create" size="sm">Add Obligation</LinkButton>}
            </div>
          }
        />

        <DataTable<RuleRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No obligations found"
          emptySubtitle="Adjust the filters, or add the obligations the auditors check against."
          emptyAction={canCreate ? <LinkButton href="/admin/compliance/rules/create" size="sm">Add Obligation</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this obligation?"
        message={pendingDelete
          ? `${pendingDelete.rule_title} will be removed. Obligations that regulations still reference are refused — mark them inactive instead.`
          : ''}
        confirmLabel="Remove Obligation"
        variant="danger"
      />
    </div>
  );
}
