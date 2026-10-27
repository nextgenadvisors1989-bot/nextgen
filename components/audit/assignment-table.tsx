'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate, daysRemaining } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { AUDIT_PRIORITIES, AUDIT_STATUSES, type AuditAssignment } from '@/types/audit';
import { ASSIGNMENT_TYPES } from '@/lib/validations/audit-assignment.validation';
import type { AssignmentListRow } from '@/repositories/audit-assignment.repository';

export interface AssignmentStats {
  total: number;
  notStarted: number;
  inProgress: number;
  underReview: number;
  approved: number;
  returned: number;
  cancelled: number;
  overdue: number;
  dueThisWeek: number;
}

export function AssignmentsTable({
  stats, employers, auditors, verifiers, permissions,
}: {
  stats: AssignmentStats;
  employers: { value: string; label: string }[];
  auditors: { value: string; label: string }[];
  verifiers: { value: string; label: string }[];
  permissions: { create: boolean; update: boolean; remove: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<AssignmentListRow>({
    endpoint: '/api/admin/audit-assignments',
    initialFilters: {
      search: '', status: 'all', type: 'all', priority: 'all', employerId: 'all',
      auditorId: 'all', verifierId: 'all', overdueOnly: 'false', dateFrom: '', dateTo: '',
    },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<AssignmentListRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<AssignmentListRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const columns: Column<AssignmentListRow>[] = [
    {
      key: 'assignment',
      header: 'Assignment',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/audit-assignments/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.audit_title, 38)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.assignment_number} · {row.assignment_type}
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
          <span className="block text-ink-soft">{truncate(row.employer_name ?? '—', 26)}</span>
          <span className="block text-xs text-ink-muted">
            {[row.unit_name, row.department_name].filter(Boolean).join(' · ') || 'All units'}
          </span>
        </div>
      ),
    },
    {
      key: 'people',
      header: 'Auditor / Verifier',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.auditor_name ?? '—', 24)}</span>
          <span className="block text-xs text-ink-muted">{row.verifier_name ? `Verifier: ${truncate(row.verifier_name, 20)}` : 'No verifier'}</span>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      hideOnMobile: true,
      render: (row) => {
        const remaining = daysRemaining(row.due_date);
        const late = remaining !== null && remaining < 0 && !['Approved', 'Cancelled'].includes(row.status);
        return (
          <div className="text-xs">
            <span className="block text-ink-soft">
              {formatDate(row.start_date)} → {formatDate(row.end_date)}
            </span>
            <span className={late ? 'block font-medium text-red-600' : 'block text-ink-muted'}>
              Due {formatDate(row.due_date)}
              {late ? ` · ${Math.abs(remaining as number)}d overdue` : remaining !== null && remaining <= 7 && !['Approved', 'Cancelled'].includes(row.status) ? ` · in ${remaining}d` : ''}
            </span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      hideOnMobile: true,
      render: (row) => <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'center',
      render: (row) => (
        <div className="mx-auto w-20">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Number(row.progress_percent ?? 0))}%` }} />
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
          <StatusBadge status={row.status} />
          {row.report_number ? <Badge tone="slate">{row.report_number}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/audit-assignments/${row.id}`} className="btn-icon" title="View assignment" aria-label={`View ${row.audit_title}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {permissions.update && row.status !== 'Approved' && row.status !== 'Cancelled' && (
            <>
              <Link href={`/admin/audit-assignments/${row.id}/edit`} className="btn-icon" title="Edit assignment" aria-label={`Edit ${row.audit_title}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </Link>
              <button type="button" className="btn-icon" title="Cancel assignment" aria-label={`Cancel ${row.audit_title}`}
                onClick={() => { setPendingCancel(row); setCancelReason(''); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" />
                </svg>
              </button>
            </>
          )}
          {permissions.remove && !row.report_id && (
            <button type="button" className="btn-icon btn-icon-danger" title="Delete assignment" aria-label={`Delete ${row.audit_title}`}
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
    setDeleting(true);
    const result = await api.delete(`/api/admin/audit-assignments/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Assignment deleted', `${pendingDelete.assignment_number} was removed and its calendar entries cleared.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not delete assignment', result.message);
    }
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    setCancelling(true);
    const result = await api.post(`/api/admin/audit-assignments/${pendingCancel.id}/cancel`, { reason: cancelReason });
    setCancelling(false);
    if (result.ok) {
      success('Assignment cancelled', `${pendingCancel.assignment_number} was cancelled and the auditor notified.`);
      setPendingCancel(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not cancel assignment', result.message);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total Assignments" value={formatNumber(stats.total)} hint={`${formatNumber(stats.cancelled)} cancelled`} tone="brand" />
        <StatCard label="Not Started" value={formatNumber(stats.notStarted)} hint="Waiting on the auditor" tone="slate" />
        <StatCard label="In Progress" value={formatNumber(stats.inProgress)} hint="Draft or underway" tone="amber" />
        <StatCard label="Under Review" value={formatNumber(stats.underReview)} hint="With the verifier" tone="violet" />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint={`${formatNumber(stats.returned)} returned`} tone="emerald" />
        <StatCard label="Overdue" value={formatNumber(stats.overdue)} hint={`${formatNumber(stats.dueThisWeek)} due this week`} tone={stats.overdue ? 'red' : 'emerald'} />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by assignment no., title, employer, unit or auditor…' },
            { key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...AUDIT_STATUSES.map((s) => ({ value: s, label: s }))] },
            { key: 'type', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...ASSIGNMENT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))] },
            { key: 'priority', type: 'select', label: 'Priority',
              options: [{ value: 'all', label: 'All priorities' }, ...AUDIT_PRIORITIES.map((p) => ({ value: p, label: p }))] },
            { key: 'employerId', type: 'select', label: 'Employer',
              options: [{ value: 'all', label: 'All employers' }, ...employers] },
            { key: 'auditorId', type: 'select', label: 'Auditor',
              options: [{ value: 'all', label: 'All auditors' }, ...auditors] },
            { key: 'verifierId', type: 'select', label: 'Verifier',
              options: [{ value: 'all', label: 'All verifiers' }, ...verifiers] },
            { key: 'overdueOnly', type: 'select', label: 'Due',
              options: [
                { value: 'false', label: 'All schedules' },
                { value: 'true', label: 'Overdue only' },
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
                  `audit-assignments-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Assignment No.', 'Title', 'Type', 'Employer', 'Unit', 'Department', 'Auditor', 'Verifier', 'Priority', 'Status', 'Progress %', 'Start', 'End', 'Due'],
                  list.data.map((row) => [
                    row.assignment_number, row.audit_title, row.assignment_type, row.employer_name, row.unit_name,
                    row.department_name, row.auditor_name, row.verifier_name, row.priority, row.status,
                    Number(row.progress_percent ?? 0), row.start_date, row.end_date, row.due_date,
                  ])
                )}>
                Export CSV
              </Button>
              {permissions.create && <LinkButton href="/admin/audit-assignments/create" size="sm">Create Assignment</LinkButton>}
            </div>
          }
        />

        <DataTable<AssignmentListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No audit assignments found"
          emptySubtitle="Adjust the filters above, or create an assignment to send an auditor to an employer."
          emptyAction={permissions.create ? <LinkButton href="/admin/audit-assignments/create" size="sm">Create Assignment</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this assignment?"
        message={pendingDelete
          ? `${pendingDelete.assignment_number} — ${pendingDelete.audit_title} will be removed along with its calendar entries. Assignments that already produced a report cannot be deleted; cancel them instead.`
          : ''}
        confirmLabel="Delete Assignment"
        variant="danger"
      />

      <Modal
        open={Boolean(pendingCancel)}
        onClose={() => setPendingCancel(null)}
        title="Cancel this assignment"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingCancel(null)}>Keep Assignment</Button>
            <Button variant="danger" onClick={confirmCancel} loading={cancelling} disabled={cancelReason.trim().length < 4}>
              Cancel Assignment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            {pendingCancel?.assignment_number} — {pendingCancel?.audit_title}. The auditor is notified with the reason
            below and the calendar entries are marked cancelled. The record stays for the audit trail.
          </p>
          <Textarea
            label="Reason for cancellation"
            rows={3}
            required
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            helper="Minimum 4 characters. This text is emailed to the auditor."
          />
        </div>
      </Modal>
    </>
  );
}

function priorityTone(priority: string): 'slate' | 'brand' | 'warning' | 'danger' {
  switch (priority) {
    case 'Urgent': return 'danger';
    case 'High': return 'warning';
    case 'Medium': return 'brand';
    default: return 'slate';
  }
}

export type { AuditAssignment };
