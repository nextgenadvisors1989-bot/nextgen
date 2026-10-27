'use client';

/** The audit reports filed about the establishment — read-only, scoped server-side. */
import Link from 'next/link';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge } from '@/components/ui/badge';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

interface ReportRow {
  id: number;
  report_number: string;
  audit_title: string;
  report_type: string | null;
  status: string;
  score_percentage: number | null;
  critical_findings: number | null;
  submitted_at: string | null;
  auditor_name: string | null;
  verifier_name: string | null;
}

export function EmployerAuditReports() {
  const list = useList<ReportRow>({
    endpoint: '/api/employer/audit-reports',
    initialFilters: { search: '', status: 'all' },
    initialSortBy: 'submitted_at',
  });

  const columns: Column<ReportRow>[] = [
    {
      key: 'report',
      header: 'Report',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/employer/audit-reports/${row.id}`} className="block font-medium text-brand-700 hover:underline">{truncate(row.audit_title, 44)}</Link>
          <span className="block text-xs text-ink-muted">
            {row.report_number}{row.report_type ? ` · ${row.report_type}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'auditor', header: 'Auditor', hideOnMobile: true, render: (row) => row.auditor_name ?? '—' },
    { key: 'verifier', header: 'Verifier', hideOnMobile: true, render: (row) => row.verifier_name ?? '—' },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      render: (row) => (row.score_percentage === null || row.score_percentage === undefined
        ? '—'
        : `${formatNumber(Math.round(Number(row.score_percentage)))}%`),
    },
    {
      key: 'critical',
      header: 'Critical',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className={Number(row.critical_findings ?? 0) > 0 ? 'font-medium text-red-600' : ''}>
          {formatNumber(Number(row.critical_findings ?? 0))}
        </span>
      ),
    },
    { key: 'submitted', header: 'Filed', hideOnMobile: true, render: (row) => (row.submitted_at ? formatDate(row.submitted_at) : '—') },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Reports on file" value={formatNumber(list.pagination.total)} tone="brand" />
        <StatCard label="Approved" value={formatNumber(list.data.filter((row) => row.status === 'Approved').length)} tone="emerald" />
        <StatCard
          label="Awaiting a decision"
          value={formatNumber(list.data.filter((row) => ['Submitted', 'Under Review'].includes(row.status)).length)}
          tone="amber"
        />
      </div>

      <ScoreTrend rows={list.data} />

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Audit reports"
            description="The reports auditors have filed about your establishment, and where each one stands with the verifier."
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search reports…' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [
                { value: 'Draft', label: 'Draft' },
                { value: 'Submitted', label: 'Submitted' },
                { value: 'Under Review', label: 'Under review' },
                { value: 'Approved', label: 'Approved' },
                { value: 'Returned', label: 'Returned' },
              ],
            },
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
          emptyTitle="No reports yet"
          emptySubtitle="Reports filed about your establishment appear here once an auditor submits them."
        />

        {list.data.length > 0 && (
          <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
        )}
      </Card>
    </div>
  );
}


/** Compliance score of each scored report, oldest to newest - are audits improving? */
function ScoreTrend({ rows }: { rows: ReportRow[] }) {
  const scored = rows
    .filter((row) => row.score_percentage !== null && row.score_percentage !== undefined)
    .sort((a, b) => String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? '')));
  return (
    <Card>
      <CardHeader title="Compliance score trend" description="Score of each audit report filed about your establishment, oldest to newest." />
      {scored.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-muted sm:px-6">Scores appear here once an audit report with a scorecard has been filed.</p>
      ) : (
        <div className="flex items-end gap-3 overflow-x-auto px-4 pb-5 pt-4 sm:px-6" role="img" aria-label="Compliance score trend">
          {scored.map((row) => {
            const value = Math.round(Number(row.score_percentage));
            return (
              <Link key={row.id} href={`/employer/audit-reports/${row.id}`} className="group flex w-16 shrink-0 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-ink">{value}%</span>
                <span className={`w-9 rounded-t ${value >= 90 ? 'bg-emerald-500' : value >= 75 ? 'bg-brand-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ height: `${Math.max(value, 4)}px` }} />
                <span className="truncate text-[11px] text-ink-muted group-hover:text-brand-700">{row.report_number.split('/').slice(-1)[0]}</span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
