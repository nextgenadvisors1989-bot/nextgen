'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime, daysRemaining } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { REPORT_STATUSES, REPORT_TYPES } from '@/lib/validations/audit-report.validation';
import type { ReportListRow } from '@/repositories/audit-report.repository';

export interface ReportStats {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  changesRequested: number;
  approved: number;
  rejected: number;
  archived: number;
  awaitingVerification: number;
  averageScore: number | null;
  criticalFindings: number;
  majorFindings: number;
  minorFindings: number;
  highScorers: number;
  lowScorers: number;
  reauditSoon: number;
}

/**
 * Report register. Filters mirror the specification's report table (status,
 * type, employer, auditor, verifier, score band, critical-only, date window) and
 * the actions column offers exactly what each status allows: view, edit, approve
 * (routes to the review screen), PDF, archive, delete.
 */
export function ReportsTable({
  stats, employers, auditors, verifiers, permissions,
}: {
  stats: ReportStats;
  employers: { value: string; label: string }[];
  auditors: { value: string; label: string }[];
  verifiers: { value: string; label: string }[];
  permissions: { create: boolean; update: boolean; remove: boolean; approve: boolean; download: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<ReportListRow>({
    endpoint: '/api/admin/audit-reports',
    initialFilters: {
      search: '', status: 'all', reportType: 'all', employerId: 'all', auditorId: 'all', verifierId: 'all',
      scoreBand: 'all', criticalOnly: 'false', pendingVerification: 'false', dateFrom: '', dateTo: '',
    },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<ReportListRow | null>(null);
  const [pendingArchive, setPendingArchive] = useState<ReportListRow | null>(null);
  const [working, setWorking] = useState(false);

  const columns: Column<ReportListRow>[] = [
    {
      key: 'report',
      header: 'Report',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/audit-reports/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.audit_title, 38)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.report_number} · {row.report_type}
            {row.assignment_number ? ` · ${row.assignment_number}` : ''} · v{row.current_version}
          </span>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Employer & Unit',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0 max-w-[200px]">
          <span className="block text-ink-soft">{truncate(row.employer_name ?? '—', 26)}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[row.unit_name, row.department_name].filter(Boolean).join(' · ') || 'All units'}
          </span>
        </div>
      ),
    },
    {
      key: 'auditor',
      header: 'Auditor',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.auditor_name ?? '—', 24)}</span>
          <span className="block text-xs text-ink-muted">{row.verifier_name ? `Verifier: ${truncate(row.verifier_name, 20)}` : 'No verifier'}</span>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'center',
      render: (row) => {
        const percentage = row.score_percentage === null ? null : Number(row.score_percentage);
        if (percentage === null) return <span className="text-xs text-ink-muted">Not scored</span>;
        return (
          <div className="mx-auto w-24">
            <span className={`text-sm font-semibold ${scoreColor(percentage)}`}>{percentage.toFixed(1)}%</span>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${scoreBar(percentage)}`} style={{ width: `${Math.min(100, percentage)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'findings',
      header: 'Findings',
      hideOnMobile: true,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={Number(row.critical_findings) > 0 ? 'danger' : 'slate'}>{Number(row.critical_findings)} C</Badge>
          <Badge tone={Number(row.major_findings) > 0 ? 'warning' : 'slate'}>{Number(row.major_findings)} M</Badge>
          <Badge tone="slate">{Number(row.minor_findings)} m</Badge>
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-xs">
          <span className="block text-ink-soft">{row.submitted_at ? formatDate(row.submitted_at) : 'Not submitted'}</span>
          {row.status === 'Approved' && row.approved_at ? (
            <span className="block text-emerald-600">Approved {formatDate(row.approved_at)}</span>
          ) : row.days_in_review !== null && row.days_in_review !== undefined ? (
            <span className="block text-ink-muted">{Number(row.days_in_review)} day(s) in review</span>
          ) : row.next_audit_due ? (
            <span className="block text-ink-muted">Next audit {formatDate(row.next_audit_due)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {Number(row.open_correction_count ?? 0) > 0 && (
            <Badge tone="warning">{Number(row.open_correction_count)} correction(s)</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="ml-auto flex max-w-[128px] flex-wrap items-center justify-end gap-1">
          <Link href={`/admin/audit-reports/${row.id}`} className="btn-icon" title="View report" aria-label={`View ${row.audit_title}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {permissions.update && !['Approved', 'Archived'].includes(row.status) && (
            <Link href={`/admin/audit-reports/${row.id}/edit`} className="btn-icon" title="Edit report" aria-label={`Edit ${row.audit_title}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {permissions.download && (
            <a className="btn-icon" title="Download PDF" aria-label={`Download ${row.report_number}`}
              href={`/api/pdf/audit-report/${row.id}`} target="_blank" rel="noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
              </svg>
            </a>
          )}
          {permissions.approve && ['Submitted', 'Under Review'].includes(row.status) && (
            <Link href={`/admin/audit-reports/${row.id}/review`} className="btn-icon" title="Review & decide" aria-label={`Review ${row.report_number}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </Link>
          )}
          {permissions.update && row.status === 'Approved' && (
            <button type="button" className="btn-icon" title="Archive report" aria-label={`Archive ${row.report_number}`}
              onClick={() => setPendingArchive(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 7h18v4H3zM5 11v9h14v-9M10 15h4" />
              </svg>
            </button>
          )}
          {permissions.remove && !['Approved'].includes(row.status) && (
            <button type="button" className="btn-icon btn-icon-danger" title="Delete report" aria-label={`Delete ${row.report_number}`}
              onClick={() => setPendingDelete(row)}>
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
    setWorking(true);
    const result = await api.delete(`/api/admin/audit-reports/${pendingDelete.id}`);
    setWorking(false);
    if (result.ok) {
      success('Report deleted', `${pendingDelete.report_number} was removed from the register.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not delete report', result.message);
    }
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    setWorking(true);
    const result = await api.post(`/api/admin/audit-reports/${pendingArchive.id}/archive`, {});
    setWorking(false);
    if (result.ok) {
      success('Report archived', `${pendingArchive.report_number} was filed away. It can be reopened from its detail page.`);
      setPendingArchive(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not archive report', result.message);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total Reports" value={formatNumber(stats.total)} hint={`${formatNumber(stats.archived)} archived`} tone="brand" />
        <StatCard label="Draft" value={formatNumber(stats.draft)} hint="Not yet submitted" tone="slate" />
        <StatCard label="Awaiting Verification" value={formatNumber(stats.awaitingVerification)} hint={`${formatNumber(stats.underReview)} under review`} tone="violet" />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint={`${formatNumber(stats.rejected)} rejected · ${formatNumber(stats.changesRequested)} returned`} tone="emerald" />
        <StatCard label="Average Score" value={stats.averageScore === null ? '—' : `${stats.averageScore}%`} hint={`${formatNumber(stats.highScorers)} at 90%+ · ${formatNumber(stats.lowScorers)} below 60%`} tone={stats.averageScore !== null && stats.averageScore >= 75 ? 'emerald' : 'amber'} />
        <StatCard label="Critical Findings" value={formatNumber(stats.criticalFindings)} hint={`${formatNumber(stats.majorFindings)} major · ${formatNumber(stats.minorFindings)} minor`} tone={stats.criticalFindings ? 'red' : 'emerald'} />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by report no., title, employer, unit, auditor or assignment…' },
            { key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...REPORT_STATUSES.map((status) => ({ value: status, label: status }))] },
            { key: 'reportType', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...REPORT_TYPES.map((type) => ({ value: type, label: type.replace('_', ' ') }))] },
            { key: 'employerId', type: 'select', label: 'Employer', options: [{ value: 'all', label: 'All employers' }, ...employers] },
            { key: 'auditorId', type: 'select', label: 'Auditor', options: [{ value: 'all', label: 'All auditors' }, ...auditors] },
            { key: 'verifierId', type: 'select', label: 'Verifier', options: [{ value: 'all', label: 'All verifiers' }, ...verifiers] },
            { key: 'scoreBand', type: 'select', label: 'Score',
              options: [
                { value: 'all', label: 'Any score' },
                { value: '90', label: '90% and above' },
                { value: '75', label: '75% – 89%' },
                { value: '60', label: '60% – 74%' },
                { value: '0', label: 'Below 60%' },
              ] },
            { key: 'criticalOnly', type: 'select', label: 'Findings',
              options: [
                { value: 'false', label: 'All reports' },
                { value: 'true', label: 'With critical findings' },
              ] },
            { key: 'pendingVerification', type: 'select', label: 'Pipeline',
              options: [
                { value: 'false', label: 'Everything' },
                { value: 'true', label: 'Pending verification' },
              ] },
            { key: 'dateFrom', type: 'date', label: 'From' },
            { key: 'dateTo', type: 'date', label: 'To' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `audit-reports-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Report No.', 'Title', 'Type', 'Employer', 'Unit', 'Auditor', 'Verifier', 'Status', 'Version', 'Score %', 'Critical', 'Major', 'Minor', 'Submitted', 'Approved', 'Next Audit Due'],
                  list.data.map((row) => [
                    row.report_number, row.audit_title, row.report_type, row.employer_name, row.unit_name,
                    row.auditor_name, row.verifier_name, row.status, row.current_version,
                    row.score_percentage, row.critical_findings, row.major_findings, row.minor_findings,
                    row.submitted_at, row.approved_at, row.next_audit_due,
                  ])
                )}>
                Export CSV
              </Button>
              {permissions.create && <LinkButton href="/admin/audit-reports/create" size="sm">Create Report</LinkButton>}
            </div>
          }
        />

        <DataTable<ReportListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No audit reports found"
          emptySubtitle="Adjust the filters above. Reports appear here as soon as an auditor submits an assignment, or you can record one manually."
          emptyAction={permissions.create ? <LinkButton href="/admin/audit-reports/create" size="sm">Create Report</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={working}
        title="Delete this report?"
        message={pendingDelete
          ? `${pendingDelete.report_number} — ${pendingDelete.audit_title} will be removed along with its version history. Approved reports cannot be deleted; archive them instead.`
          : ''}
        confirmLabel="Delete Report"
        variant="danger"
      />

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        onClose={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
        loading={working}
        title="Archive this report?"
        message={pendingArchive
          ? `${pendingArchive.report_number} stays in the register but drops out of the active pipeline. It can be reopened as a draft from its detail page.`
          : ''}
        confirmLabel="Archive Report"
      />
    </>
  );
}

function scoreColor(percentage: number): string {
  if (percentage >= 90) return 'text-emerald-600';
  if (percentage >= 75) return 'text-brand-600';
  if (percentage >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBar(percentage: number): string {
  if (percentage >= 90) return 'bg-emerald-500';
  if (percentage >= 75) return 'bg-brand-500';
  if (percentage >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}
