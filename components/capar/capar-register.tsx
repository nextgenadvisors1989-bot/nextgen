'use client';

/**
 * The CAPAR register every panel opens: the auditor's own reports, the verifier's queue, the employer's approved reports
 * and the administrator's view of everything. The API scopes the rows; this screen only adds the filters and the way in.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { CaparCreateModal } from '@/components/capar/capar-create-modal';
import { CAPAR_STATUS_TONE, type CaparListRow, type CaparPanel } from '@/types/capar';

const STATUS_OPTIONS = ['Draft', 'Submitted', 'Under Review', 'Returned', 'Approved'].map((value) => ({ value, label: value }));

export function CaparRegister({ panel, canCreate = false }: { panel: CaparPanel; canCreate?: boolean }) {
  const list = useList<CaparListRow>({
    endpoint: '/api/capar',
    initialFilters: { search: '', status: 'all' },
    initialSortBy: 'updated_at',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const stats = (list.extra.stats ?? {}) as Record<string, number>;
  const awaiting = (stats.Submitted ?? 0) + (stats['Under Review'] ?? 0);

  const columns: Column<CaparListRow>[] = [
    {
      key: 'report',
      header: 'Report',
      className: 'min-w-[220px]',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/${panel}/capar/${row.id}`} className="font-medium text-brand-600 hover:underline">{row.title}</Link>
          <span className="block text-xs text-ink-muted">
            {row.report_number}{row.revision_count > 0 ? ` · revision ${row.revision_count}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Facility',
      hideOnMobile: true,
      render: (row) => (
        <div className="max-w-[260px]">
          <span className="block text-ink-soft">{row.facility_name}</span>
          {panel !== 'employer' && !row.facility_name.startsWith(row.employer_name) && <span className="block text-xs text-ink-muted">{row.employer_name}</span>}
        </div>
      ),
    },
    {
      key: 'audit_date',
      header: 'Audit date',
      hideOnMobile: true,
      render: (row) => <span className="whitespace-nowrap text-ink-soft">{row.audit_date ? formatDate(row.audit_date) : '-'}</span>,
    },
    {
      key: 'findings',
      header: 'Findings',
      hideOnMobile: true,
      align: 'center',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Badge tone={row.violation_count > 0 ? 'danger' : 'success'}>{row.violation_count} violation{row.violation_count === 1 ? '' : 's'}</Badge>
          {panel !== 'employer' && ['Submitted', 'Under Review'].includes(row.status) && row.pending_count > 0 && (
            <Badge tone="warning">{row.pending_count} to verify</Badge>
          )}
          {row.status === 'Approved' && row.open_count > 0 && <Badge tone="info">{row.open_count} open</Badge>}
        </div>
      ),
    },
    {
      key: 'people',
      header: panel === 'auditor' ? 'Verifier' : 'Auditor',
      hideOnMobile: true,
      render: (row) => (
        <span className="block max-w-[150px] truncate text-ink-soft">
          {panel === 'auditor' ? row.verifier_name ?? 'Not chosen' : row.auditor_name}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={CAPAR_STATUS_TONE[row.status] ?? 'slate'}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <LinkButton href={`/${panel}/capar/${row.id}`} size="sm" variant="outline">
            {panel === 'verifier' && ['Submitted', 'Under Review'].includes(row.status) ? 'Review' : 'Open'}
          </LinkButton>
          {(row.status === 'Approved' || panel !== 'employer') && (
            <a className="btn-icon" title="Download PDF" aria-label={`Download ${row.report_number}`} href={`/api/pdf/capar/${row.id}`} target="_blank" rel="noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
              </svg>
            </a>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className={`mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 ${panel === 'employer' ? 'xl:grid-cols-2' : panel === 'verifier' ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`}>
        <StatCard label="Reports" value={stats.total ?? 0} hint={panel === 'employer' ? 'Approved for your company' : 'In your view'} tone="brand" />
        {panel !== 'employer' && panel !== 'verifier' && <StatCard label="Drafts" value={stats.Draft ?? 0} hint="Still being written" tone="slate" />}
        {panel !== 'employer' && <StatCard label="Awaiting review" value={awaiting} hint="With the verifier" tone="violet" />}
        {panel !== 'employer' && <StatCard label="Returned" value={stats.Returned ?? 0} hint="Need correction" tone="amber" />}
        <StatCard label="Approved" value={stats.Approved ?? 0} hint="Verified and final" tone="emerald" />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by title, number, facility or employer' },
            ...(panel === 'employer'
              ? []
              : [{ key: 'status', type: 'select' as const, label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...STATUS_OPTIONS] }]),
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              {canCreate && <Button size="sm" onClick={() => setCreateOpen(true)}>+ New CAPAR</Button>}
              {panel === 'admin' && <LinkButton href="/admin/capar/categories" size="sm" variant="outline">Categories</LinkButton>}
            </div>
          }
        />

        <DataTable<CaparListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle={panel === 'employer' ? 'No approved CAPAR reports yet' : 'No CAPAR reports yet'}
          emptySubtitle={
            panel === 'auditor'
              ? 'Start a report after an audit: record each finding with its photo, root cause, action plan and timeline.'
              : panel === 'verifier'
                ? 'Reports the auditors submit to you for verification appear here.'
                : panel === 'employer'
                  ? 'Once your auditor’s CAPAR report is verified and approved, it appears here with its action plan.'
                  : 'CAPAR reports written by the auditors appear here.'
          }
          footer={list.data.length > 0 ? <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} /> : null}
        />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}
      {canCreate && <CaparCreateModal open={createOpen} onClose={() => setCreateOpen(false)} panel={panel === 'admin' ? 'admin' : 'auditor'} />}
    </>
  );
}
