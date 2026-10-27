'use client';

/**
 * The media library.
 *
 * Assets live in the document vault; this screen is the catalogue on top of it.
 * Images preview as cards, other files as rows in the same grid, and the detail
 * panel answers the question that matters before a delete: which pages use this.
 */
import { useState } from 'react';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { formatFileSize } from '@/lib/files/file-format';
import { CMS_MEDIA_TYPES, CMS_MEDIA_FOLDERS } from '@/lib/validations/cms.validation';

interface MediaRow {
  id: number;
  uuid: string;
  file_id: number | null;
  title: string | null;
  alt_text: string | null;
  caption: string | null;
  file_name: string;
  file_path: string;
  public_url: string | null;
  mime_type: string | null;
  media_type: string;
  size_bytes: number;
  folder: string | null;
  tags: string | null;
  uploaded_by: number | null;
  uploaded_by_first: string | null;
  uploaded_by_last: string | null;
  created_at: string;
}

interface MediaStats {
  total: number;
  images: number;
  bytes: number;
  folders: number;
  folderList: { folder: string; total: number }[];
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'Every kind' },
  ...CMS_MEDIA_TYPES.map((type) => ({ value: type, label: `${type.charAt(0).toUpperCase()}${type.slice(1)}s` })),
];

const FOLDER_OPTIONS = [
  { value: 'all', label: 'Every folder' },
  ...CMS_MEDIA_FOLDERS.map((folder) => ({ value: folder, label: folder })),
];

export function MediaLibrary({ canUpload, canEdit, canDelete }: { canUpload: boolean; canEdit: boolean; canDelete: boolean }) {
  const { success, error: errorToast } = useToast();
  const list = useList<MediaRow>({
    endpoint: '/api/admin/cms/media',
    initialFilters: { search: '', media_type: 'all', folder: 'all', from_date: '', to_date: '' },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
    initialLimit: 24,
  });

  const [view, setView] = useState<'grid' | 'compact'>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', folder: 'General', alt_text: '', caption: '', tags: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [detail, setDetail] = useState<{ media: MediaRow; usage: { id: number; title: string; slug: string; status: string }[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<MediaRow | null>(null);
  const [editForm, setEditForm] = useState({ title: '', alt_text: '', caption: '', folder: 'General', tags: '', media_type: 'image' });
  const [pendingDelete, setPendingDelete] = useState<MediaRow | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = (list.extra.stats as MediaStats | undefined) ?? null;

  function changeView(next: 'grid' | 'compact') {
    setView(next);
    list.setLimit(next === 'grid' ? 24 : 25);
    list.setPage(1);
  }

  async function upload() {
    if (!files.length) {
      errorToast('Choose at least one file');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) formData.append('files', file);
      formData.append('folder', uploadForm.folder);
      if (files.length === 1 && uploadForm.title) formData.append('title', uploadForm.title);
      if (uploadForm.alt_text) formData.append('alt_text', uploadForm.alt_text);
      if (uploadForm.caption) formData.append('caption', uploadForm.caption);
      if (uploadForm.tags) formData.append('tags', uploadForm.tags);

      const response = await fetch('/api/admin/cms/media/upload', {
        method: 'POST',
        body: formData,
        headers: { 'x-csrf-token': readCsrf() },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        errorToast(payload?.message ?? `Upload failed (${response.status})`);
        return;
      }
      success(payload.message);
      setUploadOpen(false);
      setFiles([]);
      setUploadForm({ title: '', folder: 'General', alt_text: '', caption: '', tags: '' });
      list.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(row: MediaRow) {
    setDetailLoading(true);
    try {
      const result = await api.get<{ media: MediaRow; usage: { id: number; title: string; slug: string; status: string }[] }>(
        `/api/admin/cms/media/${row.id}`
      );
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      setDetail(result.data as { media: MediaRow; usage: { id: number; title: string; slug: string; status: string }[] });
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      const result = await api.put(`/api/admin/cms/media/${editing.id}`, editForm);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setEditing(null);
      list.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const result = await api.delete(`/api/admin/cms/media/${pendingDelete.id}`);
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

  function copyUrl(row: MediaRow) {
    const url = `${window.location.origin}${row.public_url ?? ''}`;
    void navigator.clipboard?.writeText(url);
    success('Asset URL copied — paste it into a page or block');
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-media-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Title', 'File', 'Kind', 'Folder', 'Size', 'Dimensions', 'Uploaded', 'URL'],
      list.data.map((row) => [
        row.title ?? '', row.file_name, row.media_type, row.folder ?? '', formatFileSize(Number(row.size_bytes)),
        '', formatDateTime(row.created_at), row.public_url ?? '',
      ])
    );
  }

  const columns: Column<MediaRow>[] = [
    {
      key: 'preview',
      header: '',
      width: 64,
      render: (row) =>
        row.media_type === 'image' && row.public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.public_url} alt={row.alt_text ?? row.title ?? ''} className="h-10 w-10 rounded object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded bg-surface-muted text-[10px] font-semibold text-ink-muted">
            {row.media_type.slice(0, 3).toUpperCase()}
          </span>
        ),
    },
    {
      key: 'title',
      header: 'Asset',
      render: (row) => (
        <div className="min-w-0">
          <button type="button" className="text-sm font-medium text-ink hover:text-brand-600" onClick={() => openDetail(row)}>
            {row.title ?? row.file_name}
          </button>
          <p className="truncate font-mono text-[11px] text-ink-muted">{row.file_name}</p>
          {row.alt_text && <p className="mt-0.5 text-[11px] text-ink-muted">alt: {truncate(row.alt_text, 60)}</p>}
        </div>
      ),
    },
    {
      key: 'media_type',
      header: 'Kind',
      hideOnMobile: true,
      render: (row) => <Badge tone="slate">{row.media_type}</Badge>,
    },
    {
      key: 'folder',
      header: 'Folder',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{row.folder ?? 'Unfiled'}</span>,
    },
    {
      key: 'size_bytes',
      header: 'Size',
      align: 'right',
      render: (row) => <span className="text-[13px] text-ink-soft">{formatFileSize(Number(row.size_bytes))}</span>,
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">{formatDateTime(row.created_at)}</p>
          {row.uploaded_by_first && (
            <p className="text-[11px] text-ink-muted">{`${row.uploaded_by_first} ${row.uploaded_by_last ?? ''}`.trim()}</p>
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
          <button type="button" className="btn-icon" title="Copy the public URL" onClick={() => copyUrl(row)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
          </button>
          {row.public_url && (
            <a href={row.public_url} target="_blank" rel="noreferrer" className="btn-icon" title="Open the file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M14 3h7v7M21 3l-9 9M19 14v6H4V5h6" />
              </svg>
            </a>
          )}
          {canEdit && (
            <button
              type="button"
              className="btn-icon"
              title="Edit the details"
              onClick={() => {
                setEditing(row);
                setEditForm({
                  title: row.title ?? '',
                  alt_text: row.alt_text ?? '',
                  caption: row.caption ?? '',
                  folder: row.folder ?? 'General',
                  tags: row.tags ?? '',
                  media_type: row.media_type,
                });
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove from the library" onClick={() => setPendingDelete(row)}>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assets" value={formatNumber(stats?.total ?? 0)} tone="brand" hint={`${formatNumber(stats?.folders ?? 0)} folder(s)`} />
        <StatCard label="Images" value={formatNumber(stats?.images ?? 0)} tone="violet" />
        <StatCard label="Storage" value={formatFileSize(Number(stats?.bytes ?? 0))} tone="slate" hint="Stored in the vault" />
        <StatCard label="Folders" value={formatNumber(stats?.folderList?.length ?? 0)} tone="emerald" />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search title, file name, alt text or tag' },
            { key: 'media_type', type: 'select', label: 'Kind', options: TYPE_OPTIONS },
            { key: 'folder', type: 'select', label: 'Folder', options: FOLDER_OPTIONS },
            { key: 'from_date', type: 'date', label: 'Uploaded from' },
            { key: 'to_date', type: 'date', label: 'Uploaded to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={canUpload ? <Button size="sm" onClick={() => setUploadOpen(true)}>Upload</Button> : undefined}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={view === 'grid' ? 'primary' : 'outline'} onClick={() => changeView('grid')}>
              Grid
            </Button>
            <Button size="sm" variant={view === 'compact' ? 'primary' : 'outline'} onClick={() => changeView('compact')}>
              Table
            </Button>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!list.data.length}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        {view === 'grid' && list.data.length > 0 && (
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 xl:grid-cols-4">
            {list.data.map((row) => (
              <figure key={row.id} className="overflow-hidden rounded-xl border border-line">
                <button type="button" className="block w-full" onClick={() => openDetail(row)} title="Open the detail">
                  {row.media_type === 'image' && row.public_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.public_url} alt={row.alt_text ?? row.title ?? ''} className="h-36 w-full object-cover" />
                  ) : (
                    <span className="flex h-36 w-full items-center justify-center bg-surface-muted text-sm font-semibold text-ink-muted">
                      {row.media_type.toUpperCase()}
                    </span>
                  )}
                </button>
                <figcaption className="px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-ink">{row.title ?? row.file_name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {row.folder ?? 'Unfiled'} · {formatFileSize(Number(row.size_bytes))}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {view === 'compact' && (
          <DataTable
            columns={columns}
            data={list.data}
            loading={list.loading}
            rowKey={(row) => row.id}
            emptyTitle="No assets match those filters"
            emptySubtitle="Upload an image or document, or clear the filters."
          />
        )}

        {view === 'grid' && list.loading && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Loading the library…</p>
        )}
        {view === 'grid' && !list.loading && !list.data.length && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Nothing in the library yet — upload the first asset.</p>
        )}

        <Pagination
          pagination={list.pagination}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
          limitOptions={view === 'grid' ? [24, 48, 96] : [10, 25, 50, 100]}
        />
      </Card>

      {/* upload */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload media"
        description="Assets are stored in the document vault — checksummed, versioned and served from the same access rules as everything else."
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={upload} loading={uploading} disabled={!files.length}>Upload {files.length ? `${files.length} file(s)` : ''}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="cms-media-files">Files</label>
            <input
              id="cms-media-files"
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <p className="helper">Up to 25 MB per file. Images, video, audio and documents are all accepted.</p>
          </div>
          <Select
            label="Folder" value={uploadForm.folder}
            onChange={(value) => setUploadForm((current) => ({ ...current, folder: value }))}
            options={CMS_MEDIA_FOLDERS.map((folder) => ({ value: folder, label: folder }))}
          />
          <Input
            label="Title" value={uploadForm.title} disabled={files.length > 1}
            placeholder={files.length > 1 ? 'Each file keeps its own name' : 'Shown in the library and pickers'}
            onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
          />
          <Input
            label="Alt text" value={uploadForm.alt_text}
            helper="Read by screen readers and search engines — describe the image."
            onChange={(event) => setUploadForm((current) => ({ ...current, alt_text: event.target.value }))}
          />
          <Textarea
            label="Caption" rows={2} value={uploadForm.caption}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setUploadForm((current) => ({ ...current, caption: event.target.value }))}
          />
          <Input
            label="Tags" value={uploadForm.tags} placeholder="header, tamil, safety"
            onChange={(event) => setUploadForm((current) => ({ ...current, tags: event.target.value }))}
          />
        </div>
      </Modal>

      {/* detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail?.media.title ?? detail?.media.file_name ?? 'Asset'}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="space-y-4">
            {detail.media.media_type === 'image' && detail.media.public_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.media.public_url} alt={detail.media.alt_text ?? ''} className="max-h-72 w-full rounded-lg border border-line object-contain" />
            )}
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['File name', detail.media.file_name],
                ['Kind', detail.media.media_type],
                ['Folder', detail.media.folder ?? 'Unfiled'],
                ['Size', formatFileSize(Number(detail.media.size_bytes))],
                ['MIME type', detail.media.mime_type ?? '—'],
                ['Uploaded', formatDateTime(detail.media.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 truncate text-[13px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {detail.media.alt_text && (
              <p className="text-[13px] text-ink-soft">
                <span className="text-ink-muted">Alt text: </span>
                {detail.media.alt_text}
              </p>
            )}
            <div>
              <p className="text-[12px] uppercase tracking-wide text-ink-muted">Vault URL</p>
              <p className="mt-1 break-all font-mono text-[12px] text-ink-soft">{detail.media.public_url ?? detail.media.file_path}</p>
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-wide text-ink-muted">Used by {detail.usage.length} page(s)</p>
              {detail.usage.length ? (
                <ul className="mt-2 space-y-1">
                  {detail.usage.map((usage) => (
                    <li key={usage.id} className="text-[13px]">
                      <a href={`/admin/cms/pages/${usage.id}`} className="text-brand-600 hover:underline">{usage.title}</a>
                      <span className="ml-2 text-[11px] text-ink-muted">/{usage.slug} · {usage.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-ink-muted">Not used on any page yet.</p>
              )}
            </div>
          </div>
        )}
        {detailLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      </Modal>

      {/* edit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Asset details"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} loading={busy}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={editForm.title} onChange={(event) => setEditForm((c) => ({ ...c, title: event.target.value }))} />
          <Input label="Alt text" value={editForm.alt_text} onChange={(event) => setEditForm((c) => ({ ...c, alt_text: event.target.value }))} />
          <Textarea
            label="Caption" rows={2} value={editForm.caption}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm((c) => ({ ...c, caption: event.target.value }))}
          />
          <Select
            label="Folder" value={editForm.folder}
            onChange={(value) => setEditForm((c) => ({ ...c, folder: value }))}
            options={CMS_MEDIA_FOLDERS.map((folder) => ({ value: folder, label: folder }))}
          />
          <Select
            label="Kind" value={editForm.media_type}
            onChange={(value) => setEditForm((c) => ({ ...c, media_type: value }))}
            options={CMS_MEDIA_TYPES.map((type) => ({ value: type, label: type }))}
          />
          <Input label="Tags" value={editForm.tags} onChange={(event) => setEditForm((c) => ({ ...c, tags: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={busy}
        title="Remove this asset from the library?"
        message={`“${pendingDelete?.title ?? pendingDelete?.file_name ?? 'The asset'}” leaves the library. The file itself stays in the document vault, so re-uploading it is not necessary. A page that still uses it refuses the removal.`}
        confirmLabel="Remove asset"
      />
    </div>
  );
}

function readCsrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
