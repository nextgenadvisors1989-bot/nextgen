'use client';

/**
 * The auditor's "Assigned Audits" register.
 *
 * Everything here is scoped server-side to the signed-in auditor, so the table
 * never has to filter for ownership — it simply shows what the API returns. Each
 * row leads to the audit workspace, where the audit is started, written and
 * submitted.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate, daysRemaining } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { AUDIT_PRIORITIES, AUDIT_STATUSES } from '@/types/audit';
import { ASSIGNMENT_TYPES } from '@/lib/validations/audit-assignment.validation';
import type { AssignmentListRow } from '@/repositories/audit-assignment.repository';
import type { AuditorAuditStats } from '@/services/auditor-workspace.service';

export function AuditorAuditTable({
  stats,
  employers,
}: {
  stats: AuditorAuditStats;
  employers: { value: string; label: string }[];
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<AssignmentListRow>({
    endpoint: '/api/auditor/audits',
    initialFilters: {
      search: '', status: 'all', type: 'all', priority: 'all', employerId: 'all',
      overdueOnly: 'false', dateFrom: '', dateTo: '',
    },
    initialSortBy: 'due_date',
    initialSortDir: 'asc',
  });
  const [starting, setStarting] = useState<number | null>(null);

  /** Opens the audit from the list without leaving the page. */
  async function startAudit(row: AssignmentListRow) {
    setStarting(row.id);
    const result = await api.post(`/api/auditor/audits/${row.id}/start`, {});
    setStarting(null);
    if (result.ok) {
      success('Audit opened', result.message);
      list.refresh();
      router.push(`/auditor/audits/${row.id}/draft`);
    } else {
      errorToast('Could not open the audit', result.message);
    }
  }

  const columns: Column<AssignmentListRow>[] = [
    {
      key: 'audit',
      header: 'Audit',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/auditor/audits/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.audit_title, 42)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.assignment_number} · {String(row.assignment_type).replace('_', ' ')}
            {row.module_name ? ` · ${row.module_name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Employer & Unit',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.employer_name ?? '—', 28)}</span>
          <span className="block text-xs text-ink-muted">
            {[row.unit_name, row.department_name].filter(Boolean).join(' · ') || 'All units'}
          </span>
        </div>
      ),
    },
    {
      key: 'window',
      header: 'Audit Window',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-xs">
          <span className="block text-ink-soft">
            {formatDate(row.start_date)} → {formatDate(row.end_date)}
          </span>
          <span className="block text-ink-muted">Verifier: {truncate(row.verifier_name ?? 'not assigned', 24)}</span>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      hideOnMobile: true,
      render: (row) => {
        const remaining = daysRemaining(row.due_date);
        const closed = ['Approved', 'Cancelled'].includes(String(row.status));
        const late = remaining !== null && remaining < 0 && !closed;
        return (
          <div className="text-xs">
            <span className={late ? 'block font-medium text-red-600' : 'block text-ink-soft'}>
              {formatDate(row.due_date)}
            </span>
            <span className={late ? 'block text-red-600' : 'block text-ink-muted'}>
              {remaining === null ? 'No due date'
                : late ? `${Math.abs(remaining)}d overdue`
                : closed ? 'Closed' : `in ${remaining}d`}
            </span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      hideOnMobile: true,
      render: (row) => <Badge tone={priorityTone(String(row.priority))}>{String(row.priority)}</Badge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'center',
      render: (row) => (
        <div className="mx-auto w-20">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.min(100, Number(row.progress_percent ?? 0))}%` }}
            />
          </div>
          <span className="mt-1 block text-xs text-ink-muted">{Number(row.progress_percent ?? 0)}%</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={String(row.status)} />
          {row.report_number ? <Badge tone="slate">{String(row.report_number)}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => {
        const closed = ['Approved', 'Cancelled'].includes(String(row.status));
        const submitted = ['Submitted', 'Under Review'].includes(String(row.status));
        const label = closed ? 'View' : submitted ? 'Preview' : row.report_id ? 'Continue' : 'Start';
        const href = closed
          ? `/auditor/audits/${row.id}`
          : submitted
            ? `/auditor/audits/${row.id}/preview`
            : row.report_id
              ? `/auditor/audits/${row.id}/draft`
              : `/auditor/audits/${row.id}/start`;
        return (
          <span className="flex items-center justify-end gap-1">
            <Link
              href={href}
              className="btn-icon"
              title={label}
              aria-label={`${label} ${row.audit_title}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                {label === 'Start' || label === 'Continue'
                  ? <path d="M5 3l14 9-14 9V3Z" />
                  : <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </Link>
            <Link href={`/auditor/audits/${row.id}`} className="btn-icon" title="Open audit" aria-label={`Open ${row.audit_title}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M14 3h7v7M21 3l-9 9" />
              </svg>
            </Link>
            {!row.report_id && !closed && (
              <button
                type="button"
                className="btn-icon"
                title="Start this audit"
                aria-label={`Start ${row.audit_title}`}
                disabled={starting === row.id}
                onClick={() => startAudit(row)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
                </svg>
              </button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Assigned Audits" value={formatNumber(stats.total)} hint={`${formatNumber(stats.highPriority)} high priority`} tone="brand" />
        <StatCard label="Not Started" value={formatNumber(stats.notStarted)} hint="Open the audit to begin" tone="slate" />
        <StatCard label="In Progress" value={formatNumber(stats.inProgress)} hint={`${formatNumber(stats.drafts)} draft report(s)`} tone="amber" />
        <StatCard label="Under Review" value={formatNumber(stats.underReview)} hint="With the verifier" tone="violet" />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint={stats.averageScore === null ? 'No score yet' : `Average ${stats.averageScore}%`} tone="emerald" />
        <StatCard
          label="Needs Attention"
          value={formatNumber(stats.overdue + stats.returned + stats.openCorrections)}
          hint={`${formatNumber(stats.overdue)} overdue · ${formatNumber(stats.returned)} returned · ${formatNumber(stats.openCorrections)} correction(s)`}
          tone={stats.overdue + stats.returned + stats.openCorrections ? 'red' : 'emerald'}
        />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by audit title, assignment number or employer…' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...AUDIT_STATUSES.map((s) => ({ value: s, label: s }))],
            },
            {
              key: 'type', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...ASSIGNMENT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))],
            },
            {
              key: 'priority', type: 'select', label: 'Priority',
              options: [{ value: 'all', label: 'All priorities' }, ...AUDIT_PRIORITIES.map((p) => ({ value: p, label: p }))],
            },
            { key: 'employerId', type: 'select', label: 'Employer', options: [{ value: 'all', label: 'All employers' }, ...employers] },
            {
              key: 'overdueOnly', type: 'select', label: 'Due',
              options: [{ value: 'false', label: 'All schedules' }, { value: 'true', label: 'Overdue only' }],
            },
            { key: 'dateFrom', type: 'date', label: 'From' },
            { key: 'dateTo', type: 'date', label: 'To' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `my-audits-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Assignment No.', 'Title', 'Type', 'Employer', 'Unit', 'Department', 'Priority', 'Status', 'Progress %', 'Report', 'Start', 'End', 'Due'],
                  list.data.map((row) => [
                    row.assignment_number, row.audit_title, row.assignment_type, row.employer_name, row.unit_name,
                    row.department_name, row.priority, row.status, Number(row.progress_percent ?? 0),
                    row.report_number, row.start_date, row.end_date, row.due_date,
                  ])
                )}
              >
                Export CSV
              </Button>
              <LinkButton href="/auditor/reports" size="sm" variant="outline">My Reports</LinkButton>
            </div>
          }
        />

        <DataTable<AssignmentListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No audits assigned yet"
          emptySubtitle="Audits assigned to you by the administrators appear here with their schedule, scope and verifier."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}
    </>
  );
}

function priorityTone(priority: string): 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'slate' {
  switch (priority) {
    case 'High': return 'danger';
    case 'Medium': return 'warning';
    case 'Low': return 'slate';
    default: return 'default';
  }
}
