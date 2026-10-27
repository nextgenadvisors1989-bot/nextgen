'use client';

/**
 * Submission register.
 *
 * One table backs every panel's view of the dynamic-module engine: the admin
 * sees all submissions, the verifier sees the queue that requires a decision and
 * the auditor sees their own drafts and filed forms. The endpoint and the
 * per-panel actions are the only things that change.
 */
import { useState } from 'react';
import Link from 'next/link';
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
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';

export interface SubmissionRow {
  id: number;
  submission_number: string;
  title: string | null;
  status: string;
  module_id: number;
  module_name: string;
  module_type: string;
  form_id: number;
  form_name: string;
  employer_id: number | null;
  company_name: string | null;
  unit_name: string | null;
  submitted_by_name: string | null;
  auditor_name: string | null;
  score_obtained: number | string | null;
  score_max: number | string | null;
  score_percentage: number | string | null;
  submission_date: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_action: string | null;
  created_at: string;
  updated_at: string;
  table_row_count: number | string;
}

export interface SubmissionStats {
  total: number;
  drafts: number;
  submitted: number;
  underReview: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  averageScore: number | null;
}

interface Option {
  value: string;
  label: string;
}

export function SubmissionList({
  endpoint,
  basePath,
  stats,
  modules,
  forms,
  statuses,
  permissions,
  emptyTitle = 'No submissions yet',
  emptySubtitle = 'Submissions appear here as soon as someone starts filling in a published form.',
}: {
  endpoint: string;
  basePath: string;
  stats: SubmissionStats;
  modules: Option[];
  forms: Option[];
  statuses: string[];
  permissions: { review: boolean; remove: boolean; download: boolean };
  emptyTitle?: string;
  emptySubtitle?: string;
}) {
  const { success, error: errorToast } = useToast();
  const list = useList<SubmissionRow>({
    endpoint,
    initialFilters: {
      search: '', module_id: 'all', form_id: 'all', status: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<SubmissionRow | null>(null);
  const [working, setWorking] = useState(false);

  async function remove(row: SubmissionRow) {
    setWorking(true);
    try {
      const response = await api.delete(`${endpoint}/${row.id}`);
      if (!response.ok) throw new Error(response.message);
      success(`${row.submission_number} deleted`);
      setPendingDelete(null);
      list.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const columns: Column<SubmissionRow>[] = [
    {
      key: 'submission',
      header: 'Submission',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`${basePath}/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.title || row.submission_number, 40)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.submission_number} · {truncate(row.module_name, 28)} / {truncate(row.form_name, 24)}
          </span>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Employer & Unit',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.company_name ?? 'Internal', 26)}</span>
          <span className="block text-xs text-ink-muted">{row.unit_name ?? 'All units'}</span>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'Filled by',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.auditor_name ?? row.submitted_by_name ?? '—', 24)}</span>
          <span className="block text-xs text-ink-muted">{Number(row.table_row_count)} table row(s)</span>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'center',
      render: (row) => {
        if (row.score_percentage === null || row.score_percentage === undefined) {
          return <span className="text-xs text-ink-muted">Not scored</span>;
        }
        const percentage = Number(row.score_percentage);
        return (
          <div>
            <span className={percentage >= 90 ? 'font-semibold text-emerald-600' : percentage >= 75 ? 'font-semibold text-brand-600' : percentage >= 60 ? 'font-semibold text-amber-600' : 'font-semibold text-red-600'}>
              {percentage.toFixed(1)}%
            </span>
            <span className="block text-xs text-ink-muted">
              {Number(row.score_obtained ?? 0).toFixed(1)} / {Number(row.score_max ?? 0).toFixed(1)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'dates',
      header: 'Last activity',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-xs">
          <span className="block text-ink-soft">{row.submitted_at ? formatDateTime(row.submitted_at) : 'Not submitted yet'}</span>
          <span className="block text-ink-muted">Updated {formatDateTime(row.updated_at)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.review_action && (
            <Badge tone={row.review_action === 'approved' ? 'success' : row.review_action === 'rejected' ? 'danger' : 'warning'}>
              {`Reviewed: ${row.review_action}`}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      width: '190px',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link href={`${basePath}/${row.id}`} className="text-xs font-medium text-brand-600 hover:underline">
            {row.status === 'draft' ? 'Continue' : permissions.review ? 'Review' : 'View'}
          </Link>
          {permissions.download && (
            <a
              href={`/api/pdf/submission/${row.id}`}
              className="text-xs font-medium text-ink-soft hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
          )}
          {permissions.remove && (
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  const filters = [
    { key: 'search', type: 'search' as const, placeholder: 'Search submission number, title, module or employer…' },
    {
      key: 'module_id',
      type: 'select' as const,
      label: 'Module',
      options: [{ value: 'all', label: 'All modules' }, ...modules],
    },
    {
      key: 'form_id',
      type: 'select' as const,
      label: 'Form',
      options: [{ value: 'all', label: 'All forms' }, ...forms],
    },
    {
      key: 'status',
      type: 'select' as const,
      label: 'Status',
      options: [{ value: 'all', label: 'All statuses' }, ...statuses.map((status) => ({ value: status, label: status.replace(/_/g, ' ') }))],
    },
    { key: 'from_date', type: 'date' as const, label: 'From' },
    { key: 'to_date', type: 'date' as const, label: 'To' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total" value={formatNumber(stats.total)} hint="Submissions recorded" tone="brand" />
        <StatCard label="Drafts" value={formatNumber(stats.drafts)} hint="Still being filled in" tone="slate" />
        <StatCard
          label="Awaiting Decision"
          value={formatNumber(stats.submitted + stats.underReview)}
          hint="With a verifier"
          tone={stats.submitted + stats.underReview > 0 ? 'amber' : 'emerald'}
        />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint="Signed off" tone="emerald" />
        <StatCard
          label="Average Score"
          value={stats.averageScore === null ? '—' : `${Number(stats.averageScore).toFixed(1)}%`}
          hint={`${formatNumber(stats.rejected)} rejected · ${formatNumber(stats.changesRequested)} returned`}
          tone="violet"
        />
      </div>

      <Card padded={false}>
        <Filters
          definitions={filters}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `submissions-page-${list.page}.csv`,
                  ['Submission', 'Module', 'Form', 'Employer', 'Filled by', 'Status', 'Score %', 'Submitted at'],
                  list.data.map((row) => [
                    row.submission_number,
                    row.module_name,
                    row.form_name,
                    row.company_name ?? '',
                    row.auditor_name ?? row.submitted_by_name ?? '',
                    row.status,
                    row.score_percentage === null ? '' : Number(row.score_percentage).toFixed(2),
                    row.submitted_at ?? '',
                  ])
                )
              }
            >
              Export page
            </Button>
          }
        />
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          serialNumber
          emptyTitle={emptyTitle}
          emptySubtitle={emptySubtitle}
          emptyAction={null}
          footer={
            list.data.length > 0 ? (
              <Pagination
                pagination={list.pagination}
                onPageChange={list.setPage}
                onLimitChange={list.setLimit}
              />
            ) : null
          }
        />
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this submission?"
        message={`${pendingDelete?.submission_number ?? ''} and its answers, table rows and generated PDF will be soft-deleted. Activity logs and notifications are preserved.`}
        confirmLabel="Delete"
        variant="danger"
        loading={working}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/** Rendered when a panel has no submissions at all — keeps the empty state honest. */
export function SubmissionEmpty({ action }: { action?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
        {action ?? <LinkButton href="/admin/dynamic-modules" variant="outline">Browse dynamic modules</LinkButton>}
      </div>
    </Card>
  );
}
