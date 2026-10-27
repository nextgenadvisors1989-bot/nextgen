'use client';

/**
 * The downloadable library register.
 *
 * Resources are the lead-generating downloads: formats, checklists, circulars and
 * explanatory guides, each attached either to a vault file or to an external
 * address, optionally gated behind a sign-in, and optionally linked to the act
 * they explain.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { RESOURCE_TYPES } from '@/lib/validations/cms.validation';

interface ResourceRow {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  resource_type: string;
  category: string | null;
  act_name: string | null;
  file_id: number | null;
  file_name: string | null;
  external_url: string | null;
  requires_login: number | boolean;
  download_count: number;
  sort_order: number;
  status: string;
  published_at: string | null;
  created_at: string;
}

interface ResourceStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  gated: number;
  external: number;
  uploaded: number;
  downloads: number;
  byType: { resource_type: string; total: number }[];
}

const STATUS_TONE: Record<string, 'success' | 'slate' | 'danger'> = {
  published: 'success',
  draft: 'slate',
  archived: 'danger',
};

export function ResourcesRegister({ canCreate, canEdit, canDelete }: { canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const { success, error: errorToast } = useToast();
  const list = useList<ResourceRow>({
    endpoint: '/api/admin/cms/resources',
    initialFilters: { search: '', status: 'all', resource_type: 'all', requires_login: 'all' },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });
  const [pendingDelete, setPendingDelete] = useState<ResourceRow | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = (list.extra.stats as ResourceStats | undefined) ?? null;

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const result = await api.delete(`/api/admin/cms/resources/${pendingDelete.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPendingDelete(null);
      list.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(row: ResourceRow) {
    const next = row.status === 'published' ? 'draft' : 'published';
    const result = await api.put(`/api/admin/cms/resources/${row.id}`, { status: next });
    if (!result.ok) {
      errorToast(result.message);
      return;
    }
    success(next === 'published' ? `${row.title} is in the public library` : `${row.title} went back to draft`);
    list.refresh();
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-resources-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Title', 'Type', 'Category', 'Act', 'Status', 'Sign-in', 'Source', 'Downloads', 'Published'],
      list.data.map((row) => [
        row.title, row.resource_type, row.category ?? '', row.act_name ?? '', row.status,
        row.requires_login ? 'Required' : 'Open', row.file_id ? 'Uploaded file' : 'External link',
        String(row.download_count), row.published_at ?? '',
      ])
    );
  }

  const columns: Column<ResourceRow>[] = [
    {
      key: 'title',
      header: 'Resource',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/cms/resources/${row.id}`} className="text-sm font-medium text-ink hover:text-brand-600">
            {row.title}
          </Link>
          <p className="font-mono text-[11px] text-ink-muted">/resources/{row.slug}</p>
          {row.description && <p className="mt-0.5 text-[12px] text-ink-muted">{truncate(row.description, 90)}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'slate'} dot>{row.status}</Badge>,
    },
    {
      key: 'resource_type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">{row.resource_type}</p>
          {row.category && <p className="text-[11px] text-ink-muted">{row.category}</p>}
        </div>
      ),
    },
    {
      key: 'act_name',
      header: 'Act',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{row.act_name ?? '—'}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      hideOnMobile: true,
      render: (row) =>
        row.file_id ? (
          <span className="text-[13px] text-ink-soft" title={row.file_name ?? ''}>
            {truncate(row.file_name ?? 'Uploaded file', 28)}
          </span>
        ) : (
          <a href={row.external_url ?? '#'} target="_blank" rel="noreferrer" className="text-[13px] text-brand-600 hover:underline">
            External link
          </a>
        ),
    },
    {
      key: 'requires_login',
      header: 'Access',
      hideOnMobile: true,
      render: (row) =>
        row.requires_login ? <Badge tone="warning">Sign-in</Badge> : <Badge tone="success">Open</Badge>,
    },
    {
      key: 'download_count',
      header: 'Downloads',
      align: 'right',
      render: (row) => <span className="text-[13px] text-ink-soft">{formatNumber(Number(row.download_count))}</span>,
    },
    {
      key: 'published_at',
      header: 'Published',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{row.published_at ? formatDate(row.published_at) : '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          {row.status === 'published' && (
            <Link href={`/resources/${row.slug}`} className="btn-icon" title="Open on the public site">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M14 3h7v7M21 3l-9 9M19 14v6H4V5h6" />
              </svg>
            </Link>
          )}
          {canEdit && (
            <>
              <Link href={`/admin/cms/resources/${row.id}`} className="btn-icon" title="Edit the resource">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </Link>
              {row.status !== 'archived' && (
                <button
                  type="button"
                  className="btn-icon"
                  title={row.status === 'published' ? 'Unpublish' : 'Publish'}
                  onClick={() => togglePublish(row)}
                >
                  {row.status === 'published' ? '⏸' : '✓'}
                </button>
              )}
            </>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Archive" onClick={() => setPendingDelete(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Resources" value={formatNumber(stats?.total ?? 0)} tone="brand" />
        <StatCard label="Published" value={formatNumber(stats?.published ?? 0)} tone="emerald" />
        <StatCard label="Drafts" value={formatNumber(stats?.draft ?? 0)} tone="slate" />
        <StatCard label="Demand sign-in" value={formatNumber(stats?.gated ?? 0)} tone="amber" />
        <StatCard label="Uploaded files" value={formatNumber(stats?.uploaded ?? 0)} tone="violet" hint={`${formatNumber(stats?.external ?? 0)} external`} />
        <StatCard label="Downloads" value={formatNumber(stats?.downloads ?? 0)} tone="brand" hint="Since the platform went live" />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search title, slug, description or category' },
            { key: 'status', type: 'select', label: 'Status', options: [
              { value: 'all', label: 'Every status' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ] },
            { key: 'resource_type', type: 'select', label: 'Type', options: [
              { value: 'all', label: 'Every type' },
              ...RESOURCE_TYPES.map((type) => ({ value: type, label: type })),
            ] },
            { key: 'requires_login', type: 'select', label: 'Access', options: [
              { value: 'all', label: 'Open and gated' },
              { value: 'no', label: 'Open to everyone' },
              { value: 'yes', label: 'Sign-in required' },
            ] },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={canCreate ? <LinkButton href="/admin/cms/resources/create" size="sm">New resource</LinkButton> : undefined}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">Everything published to the Downloads section of the public resources page.</p>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!list.data.length}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No resources match those filters"
          emptySubtitle="Publish a format, checklist or guide and it appears here."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Archive this resource?"
        message={`“${pendingDelete?.title ?? ''}” leaves the public Downloads library. The uploaded file stays in the vault, so nothing is lost if you want it back.`}
        confirmLabel="Archive resource"
      />
    </div>
  );
}
