'use client';

/**
 * The establishment's view of its own audits: what is scheduled, who is coming and
 * where each audit has got to.
 *
 * Everything is scoped server-side to the signed-in company, so the register never
 * has to filter for ownership — and a detail link carries the id of an audit the
 * company already owns.
 */
import Link from 'next/link';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

interface AuditRow {
  id: number;
  assignment_number: string;
  audit_title: string;
  audit_type: string | null;
  priority: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  auditor_name: string | null;
  progress_percent: number | null;
  unit_name: string | null;
}

const STATUSES = [
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In progress' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export function EmployerAudits({ stats }: { stats?: Record<string, unknown> | null }) {
  const list = useList<AuditRow>({
    endpoint: '/api/employer/audits',
    initialFilters: { search: '', status: 'all' },
  });

  const columns: Column<AuditRow>[] = [
    {
      key: 'audit',
      header: 'Audit',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/employer/audits/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.audit_title, 44)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.assignment_number}
            {row.audit_type ? ` · ${row.audit_type}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'unit', header: 'Unit', hideOnMobile: true, render: (row) => row.unit_name ?? '—' },
    { key: 'auditor', header: 'Auditor', hideOnMobile: true, render: (row) => row.auditor_name ?? 'Not allocated' },
    { key: 'start', header: 'Starts', hideOnMobile: true, render: (row) => (row.start_date ? formatDate(row.start_date) : '—') },
    {
      key: 'due',
      header: 'Due',
      render: (row) => (row.due_date ? formatDate(row.due_date) : '—'),
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'right',
      hideOnMobile: true,
      render: (row) => `${formatNumber(Number(row.progress_percent ?? 0))}%`,
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scheduled" value={formatNumber(Number(stats?.total ?? list.pagination.total))} tone="brand" />
        <StatCard label="In progress" value={formatNumber(Number(stats?.inProgress ?? 0))} tone="amber" />
        <StatCard label="Completed" value={formatNumber(Number(stats?.completed ?? stats?.approved ?? 0))} tone="emerald" />
        <StatCard label="Overdue" value={formatNumber(Number(stats?.overdue ?? 0))} tone={Number(stats?.overdue ?? 0) ? 'red' : 'slate'} />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Audits"
            description="Every audit scheduled against your establishment, with its auditor, its dates and where it has got to."
            action={<Badge tone="slate">{list.data.length} on this page</Badge>}
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search audits…' },
            { key: 'status', type: 'select', label: 'Status', options: STATUSES },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <DataTable
          columns={columns}
          data={list.data}
          rowKey={(row) => row.id}
          loading={list.loading}
          emptyTitle="No audits scheduled"
          emptySubtitle="Audits assigned to your establishment appear here with their dates and their auditor."
        />

        {list.data.length > 0 && (
          <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
        )}
      </Card>
    </div>
  );
}
