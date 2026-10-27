'use client';

/**
 * Admin document vault.
 *
 * One table, one row per document: the file's stable identity is the root row
 * and every re-upload adds a revision on top, so the table shows the current
 * revision's size and the number of stored versions. Filters cover ownership
 * (which module the document hangs off), kind, access level, category, uploader
 * and date range, and the whole listing can be exported as CSV.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { FileMetadataModal } from '@/components/files/file-metadata-modal';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { formatFileSize, fileKind } from '@/lib/files/file-format';
import { FILE_ACCESS_LABELS, FILE_ENTITY_LABELS } from '@/types/file';

interface FileRow {
  id: number;
  uuid: string;
  original_name: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  current_file_id?: number;
  current_size_bytes?: number;
  current_mime_type?: string | null;
  current_file_name?: string | null;
  latest_version?: number;
  version_count?: number;
  download_count?: number;
  entity_type: string;
  entity_id: number | null;
  entity_label?: string | null;
  category: string | null;
  description: string | null;
  tags: string | null;
  access_level: string;
  is_archived: number | boolean;
  expires_at: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

const ENTITY_OPTIONS = [
  { value: 'all', label: 'Every module' },
  ...Object.entries(FILE_ENTITY_LABELS).map(([value, label]) => ({ value, label })),
];

const KIND_OPTIONS = [
  { value: 'all', label: 'All file types' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Images' },
  { value: 'sheet', label: 'Spreadsheets / CSV' },
  { value: 'doc', label: 'Word documents' },
  { value: 'archive', label: 'Archives' },
  { value: 'other', label: 'Other' },
];

const ACCESS_OPTIONS = [
  { value: 'all', label: 'Every access level' },
  ...Object.entries(FILE_ACCESS_LABELS).map(([value, label]) => ({ value, label })),
];

const EMPTY_UPLOAD = {
  entityType: 'OTHER',
  entityId: '',
  category: '',
  accessLevel: 'private',
  description: '',
  tags: '',
  expiresAt: '',
};

export function FilesLibrary({
  canUpload, canEdit, canDelete, canExport,
}: {
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<FileRow>({
    endpoint: '/api/admin/files',
    initialFilters: {
      search: '', entity_type: 'all', kind: 'all', access_level: 'all', category: 'all',
      extension: 'all', status: 'current', uploaded_by: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFields, setUploadFields] = useState({ ...EMPTY_UPLOAD });
  const [editTarget, setEditTarget] = useState<FileRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stats = list.extra.stats as Record<string, number> | undefined;
  const categories = (list.extra.categories as string[] | undefined) ?? [];
  const uploaders = (list.extra.uploaders as { id: number; name: string; total: number }[] | undefined) ?? [];
  const entities = (list.extra.entityBreakdown as { entity_type: string; label: string; total: number; bytes: number }[] | undefined) ?? [];
  const extensions = (list.extra.extensions as { extension: string; total: number; bytes: number }[] | undefined) ?? [];

  async function restore(row: FileRow) {
    const result = await api.patch(`/api/admin/files/${row.id}`, { is_archived: false });
    if (result.ok) {
      success('Document restored', `${row.original_name} is back in the vault.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not restore the document', result.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/admin/files/${pendingDelete.id}`);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      success('Document archived', result.message ?? `${pendingDelete.original_name} was archived.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not archive the document', result.message);
    }
  }

  const columns: Column<FileRow>[] = [
    {
      key: 'document',
      header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/files/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.original_name, 44)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[
              fileKind(row.current_mime_type ?? row.mime_type).toUpperCase(),
              row.extension ? `.${row.extension}` : null,
              row.category || null,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Filed under',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          <Badge tone="slate">{FILE_ENTITY_LABELS[row.entity_type] ?? row.entity_type}</Badge>
          {row.entity_label ? <span className="mt-1 block text-xs text-ink-muted">{truncate(row.entity_label, 34)}</span> : null}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      render: (row) => (
        <span className="text-ink-soft">
          {formatFileSize(Number(row.current_size_bytes ?? row.size_bytes))}
          <span className="block text-xs text-ink-muted">
            v{Number(row.latest_version ?? 1)}
            {Number(row.version_count ?? 1) > 1 ? ` · ${Number(row.version_count)} stored` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      hideOnMobile: true,
      render: (row) => <Badge tone={row.access_level === 'public' ? 'info' : row.access_level === 'restricted' ? 'warning' : 'slate'}>
        {FILE_ACCESS_LABELS[row.access_level] ?? row.access_level}
      </Badge>,
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {formatDateTime(row.created_at)}
          <span className="block text-xs text-ink-muted">{row.uploaded_by_name ?? 'System'}</span>
        </span>
      ),
    },
    {
      key: 'downloads',
      header: 'Downloads',
      align: 'center',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{formatNumber(row.download_count ?? 0)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => {
        const archived = Boolean(Number(row.is_archived));
        return (
          <span className="flex items-center justify-end gap-1">
            <Link href={`/admin/files/${row.id}`} className="btn-icon" title="Open document" aria-label={`Open ${row.original_name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
            {!archived ? (
              <a
                className="btn-icon" title="Download"
                aria-label={`Download ${row.original_name}`}
                href={`/api/files/${row.current_file_id ?? row.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
                </svg>
              </a>
            ) : null}
            {canEdit && !archived && (
              <button type="button" className="btn-icon" title="Edit metadata" aria-label={`Edit ${row.original_name}`} onClick={() => setEditTarget(row)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            {canEdit && archived && (
              <button type="button" className="btn-icon" title="Restore" aria-label={`Restore ${row.original_name}`} onClick={() => restore(row)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
              </button>
            )}
            {canDelete && !archived && (
              <button type="button" className="btn-icon btn-icon-danger" title="Archive document"
                aria-label={`Archive ${row.original_name}`} onClick={() => setPendingDelete(row)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              </button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Documents in the vault" value={formatNumber(stats?.total ?? list.pagination.total)}
          hint={`${formatFileSize(stats?.totalBytes ?? 0)} stored across ${formatNumber(stats?.versions ?? 0)} versions`} tone="brand" />
        <StatCard label="Added in the last 30 days" value={formatNumber(stats?.addedLast30 ?? 0)}
          hint={`${formatNumber(stats?.pdfs ?? 0)} PDFs · ${formatNumber(stats?.images ?? 0)} images`} tone="emerald" />
        <StatCard label="Archived" value={formatNumber(stats?.archived ?? 0)}
          hint="Soft-deleted documents kept for the audit trail" tone="slate" />
        <StatCard label="Expiring within 30 days" value={formatNumber(stats?.expiringSoon ?? 0)}
          hint="Documents with a validity end date" tone="amber" />
      </div>

      {(entities.length > 0 || extensions.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {entities.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">By module</h3>
              <div className="flex flex-wrap gap-2">
                {entities.map((row) => (
                  <button
                    key={row.entity_type}
                    type="button"
                    onClick={() => list.setFilter('entity_type', row.entity_type)}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-300"
                  >
                    <span className="text-ink-soft">{row.label}</span>
                    <span className="font-semibold text-ink">{formatNumber(row.total)}</span>
                    <span className="text-xs text-ink-muted">{formatFileSize(row.bytes)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {extensions.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">By file type</h3>
              <div className="flex flex-wrap gap-2">
                {extensions.map((row) => (
                  <button
                    key={row.extension}
                    type="button"
                    onClick={() => list.setFilter('extension', row.extension)}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-300"
                  >
                    <span className="uppercase text-ink-soft">{row.extension}</span>
                    <span className="font-semibold text-ink">{formatNumber(row.total)}</span>
                    <span className="text-xs text-ink-muted">{formatFileSize(row.bytes)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by file name, description, tag or category…' },
            { key: 'entity_type', type: 'select', label: 'Module', options: ENTITY_OPTIONS },
            { key: 'kind', type: 'select', label: 'File type', options: KIND_OPTIONS },
            {
              key: 'access_level', type: 'select', label: 'Access level', options: ACCESS_OPTIONS,
            },
            {
              key: 'category', type: 'select', label: 'Category',
              options: [{ value: 'all', label: 'Every category' }, ...categories.map((value) => ({ value, label: value }))],
            },
            {
              key: 'status', type: 'select', label: 'Lifecycle',
              options: [
                { value: 'current', label: 'Active documents' },
                { value: 'archived', label: 'Archived only' },
                { value: 'all', label: 'Active and archived' },
              ],
            },
            {
              key: 'uploaded_by', type: 'select', label: 'Uploaded by',
              options: [
                { value: 'all', label: 'Anyone' },
                ...uploaders.map((row) => ({ value: String(row.id), label: `${row.name.trim()} (${row.total})` })),
              ],
            },
            { key: 'from_date', type: 'date', label: 'Uploaded from' },
            { key: 'to_date', type: 'date', label: 'Uploaded to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              {canExport && (
                <Button
                  variant="outline" size="sm" disabled={list.data.length === 0}
                  onClick={() => downloadCsv(
                    `document-vault-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['File name', 'Module', 'Entity', 'Category', 'Type', 'Version', 'Size (bytes)', 'Access level', 'Downloads', 'Uploaded by', 'Uploaded at'],
                    list.data.map((row) => [
                      row.original_name, FILE_ENTITY_LABELS[row.entity_type] ?? row.entity_type, row.entity_label ?? '',
                      row.category, row.extension, row.latest_version ?? 1,
                      row.current_size_bytes ?? row.size_bytes, row.access_level, row.download_count ?? 0,
                      row.uploaded_by_name ?? '', row.created_at,
                    ])
                  )}
                >
                  Export CSV
                </Button>
              )}
              {canUpload && (
                <Button size="sm" onClick={() => { setUploadFields({ ...EMPTY_UPLOAD }); setUploadOpen(true); }}>
                  Upload Document
                </Button>
              )}
            </div>
          }
        />

        <DataTable<FileRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No documents found"
          emptySubtitle="Adjust the filters, or upload the first document into the vault."
          emptyAction={canUpload ? <Button size="sm" onClick={() => setUploadOpen(true)}>Upload Document</Button> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      {/* Upload: metadata travels with the bytes, so the vault row is complete immediately. */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        description="Pick where the document belongs, set who may open it, then drop the file."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Close</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Filed under" value={uploadFields.entityType}
              onChange={(value) => setUploadFields((current) => ({ ...current, entityType: value }))}
              options={Object.entries(FILE_ENTITY_LABELS).map(([value, label]) => ({ value, label }))}
              helper="Which module owns this document"
            />
            <Input
              label="Record id" value={uploadFields.entityId} placeholder="Optional — for example an employee id"
              onChange={(event) => setUploadFields((current) => ({ ...current, entityId: event.target.value }))}
              helper="Attach the file to a specific record"
            />
            <Input
              label="Category" value={uploadFields.category} placeholder="Licence, Certificate, Policy…"
              onChange={(event) => setUploadFields((current) => ({ ...current, category: event.target.value }))}
            />
            <Select
              label="Access level" value={uploadFields.accessLevel}
              onChange={(value) => setUploadFields((current) => ({ ...current, accessLevel: value }))}
              options={Object.entries(FILE_ACCESS_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <Input
              label="Tags" value={uploadFields.tags} placeholder="comma, separated, tags"
              onChange={(event) => setUploadFields((current) => ({ ...current, tags: event.target.value }))}
            />
            <DatePicker
              label="Valid until" value={uploadFields.expiresAt}
              onChange={(value) => setUploadFields((current) => ({ ...current, expiresAt: value }))}
              helper="Optional — drives the expiring-documents tile"
            />
          </div>

          <Textarea
            label="Description" rows={2} value={uploadFields.description}
            onChange={(event) => setUploadFields((current) => ({ ...current, description: event.target.value }))}
            placeholder="What this document is and who issued it"
          />

          {uploadOpen && (
            <FileUpload
              endpoint="/api/admin/files"
              entityType={uploadFields.entityType}
              entityId={uploadFields.entityId ? Number(uploadFields.entityId) : null}
              category={uploadFields.category || undefined}
              extraFields={{
                accessLevel: uploadFields.accessLevel,
                description: uploadFields.description,
                tags: uploadFields.tags,
                expiresAt: uploadFields.expiresAt,
              }}
              multiple
              label="File"
              helper="PDF, image, Word, Excel, CSV or ZIP up to 25 MB — several files may be dropped at once."
              onUploaded={(files) => {
                success(
                  files.length === 1 ? 'Document uploaded' : `${files.length} documents uploaded`,
                  'The vault row carries the metadata you chose.'
                );
                setUploadOpen(false);
                list.refresh();
                router.refresh();
              }}
              onError={(message) => errorToast('Upload failed', message)}
            />
          )}
        </div>
      </Modal>

      <FileMetadataModal
        file={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => list.refresh()}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Archive this document?"
        message={pendingDelete
          ? `${pendingDelete.original_name} leaves the active listing. The file and all ${Number(pendingDelete.version_count ?? 1)} stored version(s) are retained and can be restored.`
          : ''}
        confirmLabel="Archive Document"
        variant="danger"
      />
    </div>
  );
}
