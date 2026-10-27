'use client';

/**
 * The page register.
 *
 * One row per page with its type, template, menu placement, section count and
 * view count. Publishing actions work from the row and in bulk: publish,
 * unpublish, archive and restore each report per-page outcomes, so a refusal on
 * one page never hides the fate of the rest.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { CMS_PAGE_TYPE_LABELS } from '@/lib/validations/cms.validation';

interface PageRow {
  id: number;
  title: string;
  slug: string;
  subtitle: string | null;
  status: string;
  page_type: string;
  template: string;
  show_in_menu: number | boolean;
  menu_label: string | null;
  is_homepage: number | boolean;
  scheduled_at: string | null;
  published_at: string | null;
  view_count: number;
  section_count: number;
  updated_at: string;
  updated_by_first: string | null;
  updated_by_last: string | null;
}

interface CmsStats {
  total: number;
  published: number;
  draft: number;
  scheduled: number;
  archived: number;
  inMenu: number;
  scheduledDue: number;
  sections: number;
  views: number;
  lastPublished: string | null;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'slate' | 'danger' | 'brand'> = {
  published: 'success',
  draft: 'slate',
  scheduled: 'warning',
  archived: 'danger',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Every status' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Every type' },
  ...Object.entries(CMS_PAGE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

export function PagesRegister({ canCreate, canEdit, canDelete }: { canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<PageRow>({
    endpoint: '/api/admin/cms/pages',
    initialFilters: { search: '', status: 'all', page_type: 'all', template: 'all', menu: 'all', from_date: '', to_date: '' },
    initialSortBy: 'updated_at',
    initialSortDir: 'desc',
  });

  const [selected, setSelected] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'publish' | 'unpublish' | 'archive' | 'restore'>('publish');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ row: PageRow; action: 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete' } | null>(null);

  const stats = (list.extra.stats as CmsStats | undefined) ?? null;
  const allSelected = list.data.length > 0 && list.data.every((row) => selected.includes(row.id));

  function toggleAll() {
    setSelected(allSelected ? [] : list.data.map((row) => row.id));
  }

  async function applyStatus(row: PageRow, action: string) {
    const result = await api.post(`/api/admin/cms/pages/${row.id}/status`, { action });
    if (!result.ok) {
      errorToast(result.message);
      return false;
    }
    success(result.message);
    return true;
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.action === 'delete') {
        const result = await api.delete(`/api/admin/cms/pages/${pending.row.id}`, { confirm: true });
        if (!result.ok) {
          errorToast(result.message);
          return;
        }
        success(result.message);
      } else if (!(await applyStatus(pending.row, pending.action))) {
        return;
      }
      setPending(null);
      list.refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runBulk() {
    setBusy(true);
    try {
      const result = await api.post<{ succeeded: number; failed: number; results: { title: string; status: string; message: string }[] }>(
        '/api/admin/cms/pages/bulk',
        { ids: selected, action: bulkAction }
      );
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setBulkOpen(false);
      setSelected([]);
      list.refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-cms-pages-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Title', 'Slug', 'Type', 'Status', 'Template', 'Menu', 'Sections', 'Views', 'Published', 'Updated'],
      list.data.map((row) => [
        row.title, `/${row.slug}`, CMS_PAGE_TYPE_LABELS[row.page_type] ?? row.page_type, row.status, row.template,
        row.show_in_menu ? (row.menu_label ?? 'Shown') : 'Hidden', String(row.section_count),
        String(row.view_count), row.published_at ?? '', row.updated_at,
      ])
    );
  }

  const columns: Column<PageRow>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Select every page on this page"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 accent-brand-500"
        />
      ),
      width: 40,
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.title}`}
          checked={selected.includes(row.id)}
          onChange={() =>
            setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]))
          }
          className="h-4 w-4 accent-brand-500"
        />
      ),
    },
    {
      key: 'title',
      header: 'Page',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/cms/pages/${row.id}`} className="text-sm font-medium text-ink hover:text-brand-600">
            {row.title}
          </Link>
          <p className="font-mono text-[11px] text-ink-muted">
            /{row.slug}
            {row.is_homepage ? ' · homepage' : ''}
          </p>
          {row.subtitle && <p className="mt-0.5 text-[12px] text-ink-muted">{truncate(row.subtitle, 90)}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[row.status] ?? 'slate'} dot>{row.status}</Badge>
          {row.status === 'scheduled' && row.scheduled_at && (
            <span className="text-[11px] text-ink-muted">→ {formatDateTime(row.scheduled_at)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'page_type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{CMS_PAGE_TYPE_LABELS[row.page_type] ?? row.page_type}</span>,
    },
    {
      key: 'menu',
      header: 'Menu',
      hideOnMobile: true,
      render: (row) =>
        row.show_in_menu ? (
          <Badge tone="brand">{row.menu_label ?? 'In menu'}</Badge>
        ) : (
          <span className="text-[12px] text-ink-muted">Hidden</span>
        ),
    },
    {
      key: 'section_count',
      header: 'Blocks',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{Number(row.section_count)}</span>,
    },
    {
      key: 'view_count',
      header: 'Views',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{formatNumber(Number(row.view_count))}</span>,
    },
    {
      key: 'updated_at',
      header: 'Last edited',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">{formatDateTime(row.updated_at)}</p>
          {row.updated_by_first && (
            <p className="text-[11px] text-ink-muted">{`${row.updated_by_first} ${row.updated_by_last ?? ''}`.trim()}</p>
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
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/cms/pages/${row.id}/preview`} className="btn-icon" title="Preview the page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canEdit && (
            <Link href={`/admin/cms/pages/${row.id}`} className="btn-icon" title="Edit the page">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canEdit && row.status !== 'published' && (
            <button type="button" className="btn-icon" title="Publish now" onClick={() => setPending({ row, action: 'publish' })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="m5 12 5 5L20 7" />
              </svg>
            </button>
          )}
          {canEdit && row.status === 'published' && (
            <button type="button" className="btn-icon" title="Unpublish" onClick={() => setPending({ row, action: 'unpublish' })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn-icon btn-icon-danger"
              title="Archive the page"
              onClick={() => setPending({ row, action: 'delete' })}
            >
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
        <StatCard label="Pages" value={formatNumber(stats?.total ?? 0)} tone="brand" hint={`${formatNumber(stats?.sections ?? 0)} blocks`} />
        <StatCard label="Published" value={formatNumber(stats?.published ?? 0)} tone="emerald" hint={stats?.lastPublished ? `Latest ${formatDateTime(stats.lastPublished)}` : 'Nothing live yet'} />
        <StatCard label="Drafts" value={formatNumber(stats?.draft ?? 0)} tone="slate" />
        <StatCard label="Scheduled" value={formatNumber(stats?.scheduled ?? 0)} tone="amber" hint={stats?.scheduledDue ? `${stats.scheduledDue} due now` : undefined} />
        <StatCard label="In the menu" value={formatNumber(stats?.inMenu ?? 0)} tone="violet" />
        <StatCard label="Page views" value={formatNumber(stats?.views ?? 0)} tone="brand" hint="Public reads" />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search title, slug or menu label' },
            { key: 'status', type: 'select', label: 'Status', options: STATUS_OPTIONS },
            { key: 'page_type', type: 'select', label: 'Type', options: TYPE_OPTIONS },
            { key: 'menu', type: 'select', label: 'Menu', options: [
              { value: 'all', label: 'Menu and hidden' },
              { value: 'shown', label: 'In the menu' },
              { value: 'hidden', label: 'Hidden' },
            ] },
            { key: 'from_date', type: 'date', label: 'Created from' },
            { key: 'to_date', type: 'date', label: 'Created to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={canCreate ? <LinkButton href="/admin/cms/pages/create" size="sm">New page</LinkButton> : undefined}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">
            {selected.length ? `${selected.length} page(s) selected` : 'Every page the platform publishes, newest edit first.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 && canEdit && (
              <>
                <Select
                  size="sm"
                  value={bulkAction}
                  onChange={(value) => setBulkAction(value as typeof bulkAction)}
                  options={[
                    { value: 'publish', label: 'Publish selected' },
                    { value: 'unpublish', label: 'Unpublish selected' },
                    { value: 'archive', label: 'Archive selected' },
                    { value: 'restore', label: 'Restore selected' },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-600"
                >
                  Apply to {selected.length}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={!list.data.length}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No pages match those filters"
          emptySubtitle="Create the first page, or clear the filters to see the register."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        loading={busy}
        variant={pending?.action === 'delete' ? 'danger' : 'primary'}
        title={
          pending?.action === 'delete'
            ? `Archive “${pending?.row.title}”?`
            : `${pending?.action === 'publish' ? 'Publish' : pending?.action === 'unpublish' ? 'Unpublish' : 'Restore'} “${pending?.row.title}”?`
        }
        message={
          pending?.action === 'delete'
            ? 'The page leaves the public site and everything that links to it. Its sections are kept, so restoring it later brings the page back intact.'
            : pending?.action === 'publish'
              ? 'The page becomes visible on the public site immediately, at its slug address.'
              : pending?.action === 'unpublish'
                ? 'The page returns to draft and disappears from the public site. Its publication date is kept as history.'
                : 'The page comes back as a draft so you can review it before publishing again.'
        }
        confirmLabel={pending?.action === 'delete' ? 'Archive page' : 'Confirm'}
      />

      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={runBulk}
        loading={busy}
        variant={bulkAction === 'archive' ? 'danger' : 'primary'}
        title={`${bulkAction.charAt(0).toUpperCase()}${bulkAction.slice(1)} ${selected.length} page(s)?`}
        message="Each page is reported separately — anything that cannot change (already published, for example) is listed as refused rather than silently skipped."
        confirmLabel="Apply to all"
      />
    </div>
  );
}
