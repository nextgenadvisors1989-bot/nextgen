'use client';

/**
 * The auditor's "My Reports" register: every report they have raised, with its
 * live status, score, finding counts and the version currently on record. Rows
 * open the audit workspace so the report can be continued or read in place.
 */
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { REPORT_STATUSES } from '@/lib/validations/audit-report.validation';
import type { ReportListRow } from '@/repositories/audit-report.repository';
import type { AuditorReportStats } from '@/services/auditor-workspace.service';

export function AuditorReportTable({ stats }: { stats: AuditorReportStats }) {
  const list = useList<ReportListRow>({
    endpoint: '/api/auditor/reports',
    initialFilters: { search: '', status: 'all' },
    initialLimit: 25,
  });

  const columns: Column<ReportListRow>[] = [
    {
      key: 'report',
      header: 'Report',
      render: (row) => (
        <div className="min-w-0">
          <span className="block font-medium text-ink-strong">{truncate(row.audit_title, 42)}</span>
          <span className="block text-xs text-ink-muted">
            {row.report_number} · v{Number(row.current_version ?? 1)} · {String(row.report_type).replace('_', ' ')}
          </span>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Employer',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.employer_name ?? '—', 28)}</span>
          <span className="block text-xs text-ink-muted">{row.unit_name ?? 'All units'}</span>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-ink-soft">
          {formatDate(row.audit_period_from)} → {formatDate(row.audit_period_to)}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'center',
      render: (row) => (
        row.score_percentage === null || row.score_percentage === undefined
          ? <span className="text-xs text-ink-muted">Not scored</span>
          : (
            <div className="mx-auto w-20">
              <span className="block text-sm font-semibold text-ink-strong">{Number(row.score_percentage).toFixed(1)}%</span>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${Number(row.score_percentage) >= 75 ? 'bg-emerald-500' : Number(row.score_percentage) >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Number(row.score_percentage))}%` }}
                />
              </div>
            </div>
          )
      ),
    },
    {
      key: 'findings',
      header: 'Findings',
      hideOnMobile: true,
      align: 'center',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {Number(row.critical_findings ?? 0) > 0 && <Badge tone="danger">{Number(row.critical_findings)} C</Badge>}
          {Number(row.major_findings ?? 0) > 0 && <Badge tone="warning">{Number(row.major_findings)} M</Badge>}
          {Number(row.minor_findings ?? 0) > 0 && <Badge tone="info">{Number(row.minor_findings)} m</Badge>}
          {Number(row.observations ?? 0) > 0 && <Badge tone="slate">{Number(row.observations)} obs</Badge>}
          {Number(row.critical_findings ?? 0) + Number(row.major_findings ?? 0)
            + Number(row.minor_findings ?? 0) + Number(row.observations ?? 0) === 0 && (
            <span className="text-xs text-ink-muted">None recorded</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={String(row.status)} />,
    },
    {
      key: 'dates',
      header: 'Submitted / Approved',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-xs">
          <span className="block text-ink-soft">Submitted {formatDate(row.submitted_at)}</span>
          <span className="block text-ink-muted">Approved {formatDate(row.approved_at)}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <a
            href={`/api/pdf/audit-report/${row.id}`}
            className="btn-icon"
            title="Download PDF"
            aria-label={`Download PDF for ${row.audit_title}`}
            target="_blank"
            rel="noreferrer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
            </svg>
          </a>
          {row.assignment_id ? (
            <a
              href={`/auditor/audits/${row.assignment_id}`}
              className="btn-icon"
              title="Open the audit"
              aria-label={`Open the audit for ${row.audit_title}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M14 3h7v7M21 3l-9 9" />
              </svg>
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Reports" value={formatNumber(stats.total)} hint={`${formatNumber(stats.draft)} in draft`} tone="brand" />
        <StatCard label="Under Review" value={formatNumber(stats.underReview)} hint="Awaiting a decision" tone="violet" />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint={`${formatNumber(stats.archived)} archived`} tone="emerald" />
        <StatCard label="Returned" value={formatNumber(stats.returned)} hint="Rejected or changes requested" tone={stats.returned ? 'red' : 'emerald'} />
        <StatCard
          label="Average Score"
          value={stats.averageScore === null ? '—' : `${stats.averageScore}%`}
          hint="Across approved reports"
          tone="amber"
        />
        <StatCard
          label="Findings Raised"
          value={formatNumber(stats.criticalFindings + stats.majorFindings + stats.minorFindings)}
          hint={`${formatNumber(stats.criticalFindings)} critical · ${formatNumber(stats.observations)} observation(s)`}
          tone={stats.criticalFindings ? 'red' : 'slate'}
        />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by report number, title or employer…' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...REPORT_STATUSES.map((s) => ({ value: s, label: s }))],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <Button
              variant="outline"
              size="sm"
              disabled={list.data.length === 0}
              onClick={() => downloadCsv(
                `my-reports-${new Date().toISOString().slice(0, 10)}.csv`,
                ['Report No.', 'Title', 'Type', 'Employer', 'Unit', 'Status', 'Version', 'Score %', 'Critical', 'Major', 'Minor', 'Observations', 'Submitted', 'Approved'],
                list.data.map((row) => [
                  row.report_number, row.audit_title, row.report_type, row.employer_name, row.unit_name, row.status,
                  Number(row.current_version ?? 1), row.score_percentage, row.critical_findings, row.major_findings,
                  row.minor_findings, row.observations, row.submitted_at, row.approved_at,
                ])
              )}
            >
              Export CSV
            </Button>
          }
        />

        <DataTable<ReportListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No reports yet"
          emptySubtitle="Reports appear here as soon as you start an assigned audit and save your first draft."
        />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}
    </>
  );
}
