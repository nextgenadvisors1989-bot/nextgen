'use client';

/**
 * Document detail — everything the vault knows about one file.
 *
 * The document (root row) keeps its identity; each revision is immutable, so
 * the Versions tab is the whole story of what changed, when and by whom. A new
 * revision is uploaded from here, and the metadata editor doubles as the
 * archive/restore switch.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { formatFileSize, fileKind } from '@/lib/files/file-format';
import { FILE_ACCESS_LABELS, FILE_ENTITY_LABELS } from '@/types/file';
import { ComplianceActivity } from '@/components/compliance/shared';
import { FileMetadataModal, type FileMetadataTarget } from '@/components/files/file-metadata-modal';

export interface VaultDocument extends FileMetadataTarget {
  uuid: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  checksum_sha256?: string | null;
  storage_driver?: string;
  entity_type: string;
  entity_id: number | null;
  entity_label?: string | null;
  version: number;
  download_count?: number;
  uploaded_by_name?: string | null;
  uploaded_by_email?: string | null;
  created_at: string;
  updated_at?: string | null;
  current_file_id?: number;
  current_version?: number;
  current_size_bytes?: number;
  current_mime_type?: string | null;
  current_file_name?: string;
  current_checksum?: string | null;
  current_uploaded_at?: string | null;
}

export interface VaultVersion {
  id: number;
  version: number;
  size_bytes: number;
  checksum_sha256: string | null;
  change_note: string | null;
  created_at: string;
  uploaded_by_name?: string | null;
}

interface VersionRow extends VaultVersion {
  is_current?: boolean;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="max-w-[62%] break-words text-right text-sm text-ink-soft">{children}</dd>
    </div>
  );
}

/** Entity deep links so the document can be traced back to its record. */
function entityHref(entityType: string, entityId: number | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case 'EMPLOYER': return `/admin/employers/${entityId}`;
    case 'EMPLOYEE': return `/admin/employees/${entityId}`;
    case 'AUDITOR': return `/admin/auditors/${entityId}`;
    case 'AUDIT_ASSIGNMENT': return `/admin/audit-assignments/${entityId}`;
    case 'AUDIT_REPORT': return `/admin/audit-reports/${entityId}`;
    case 'SUBMISSION': return `/admin/dynamic-submissions/${entityId}`;
    case 'COMPLIANCE_DOCUMENT': return `/admin/compliance/documents/${entityId}`;
    default: return null;
  }
}

export function FileDetail({
  document, current, versions, downloadCount, canEdit, canDelete,
}: {
  document: VaultDocument;
  current: { id: number; original_name: string; url: string; size_bytes: number; mime_type: string | null; version: number };
  versions: VaultVersion[];
  downloadCount: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archived = Boolean(Number(document.is_archived));
  const href = entityHref(document.entity_type, document.entity_id);
  const versionRows: VersionRow[] = versions.map((version) => ({
    ...version,
    is_current: Number(version.version) === Number(current.version),
  }));

  async function archive() {
    setDeleting(true);
    const result = await api.delete(`/api/admin/files/${document.id}`);
    setDeleting(false);
    setPendingDelete(false);
    if (result.ok) {
      success('Document archived', result.message ?? `${document.original_name} was archived.`);
      router.refresh();
    } else {
      errorToast('Could not archive the document', result.message);
    }
  }

  async function restore() {
    const result = await api.patch(`/api/admin/files/${document.id}`, { is_archived: false });
    if (result.ok) {
      success('Document restored', `${document.original_name} is back in the vault.`);
      router.refresh();
    } else {
      errorToast('Could not restore the document', result.message);
    }
  }

  const versionColumns: Column<VersionRow>[] = [
    {
      key: 'version',
      header: 'Version',
      width: 110,
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-ink">v{Number(row.version)}</span>
          {row.is_current ? <Badge tone="success">Current</Badge> : null}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Change note',
      render: (row) => <span className="text-ink-soft">{row.change_note ?? '—'}</span>,
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{formatFileSize(Number(row.size_bytes))}</span>,
    },
    {
      key: 'checksum',
      header: 'SHA-256',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-ink-muted">{row.checksum_sha256 ? `${row.checksum_sha256.slice(0, 16)}…` : '—'}</span>
      ),
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
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (archived ? (
        <span className="text-xs text-ink-muted">Archived</span>
      ) : (
        <a
          className="text-xs font-medium text-brand-600 hover:underline"
          href={`/api/files/${row.id}/download`}
          target="_blank"
          rel="noreferrer"
        >
          Download
        </a>
      )),
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold uppercase text-brand-700">
              {fileKind(document.current_mime_type ?? document.mime_type).slice(0, 4)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink">{document.current_file_name ?? document.original_name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <Badge tone="slate">{FILE_ENTITY_LABELS[document.entity_type] ?? document.entity_type}</Badge>
                <Badge tone={document.access_level === 'public' ? 'info' : document.access_level === 'restricted' ? 'warning' : 'slate'}>
                  {FILE_ACCESS_LABELS[document.access_level] ?? document.access_level}
                </Badge>
                {archived ? <Badge tone="danger">Archived</Badge> : null}
                <span>
                  {formatFileSize(Number(document.current_size_bytes ?? document.size_bytes))} · v{Number(current.version)}
                  {Number(document.version_count ?? 1) > 1 ? ` · ${Number(document.version_count)} versions` : ''}
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Filed under{' '}
                {href ? <Link href={href} className="text-brand-600 hover:underline">{document.entity_label ?? `#${document.entity_id}`}</Link> : (document.entity_label ?? 'the vault')}
                {' · '}uploaded {formatDateTime(document.created_at)} by {document.uploaded_by_name ?? 'System'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!archived ? (
              <a className="btn btn-outline btn-sm" href={current.url} target="_blank" rel="noreferrer">
                Download v{Number(current.version)}
              </a>
            ) : (
              <span className="rounded-lg border border-dashed border-line bg-surface-muted px-3 py-1.5 text-xs text-ink-muted">
                Archived — restore to download
              </span>
            )}
            {!archived && document.current_mime_type === 'application/pdf' && (
              <a className="btn btn-ghost btn-sm" href={`${current.url}?inline=true`} target="_blank" rel="noreferrer">Open PDF</a>
            )}
            {canEdit && !archived && (
              <Button size="sm" variant="outline" onClick={() => { setChangeNote(''); setVersionOpen(true); }}>
                New Version
              </Button>
            )}
            {canEdit && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit Metadata</Button>}
            {canEdit && !archived && (
              <Button size="sm" variant="danger" onClick={() => setPendingDelete(true)}>Archive</Button>
            )}
            {canEdit && archived && <Button size="sm" onClick={restore}>Restore</Button>}
          </div>
        </div>
      </Card>

      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card padded={false}>
                  <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">File</h3>
                  <dl>
                    <DetailRow label="Original name">{document.original_name}</DetailRow>
                    <DetailRow label="MIME type">{document.current_mime_type ?? document.mime_type ?? '—'}</DetailRow>
                    <DetailRow label="Extension">.{document.extension ?? '—'}</DetailRow>
                    <DetailRow label="Size">{formatFileSize(Number(document.current_size_bytes ?? document.size_bytes))}</DetailRow>
                    <DetailRow label="Version">{`v${Number(current.version)} of ${Number(document.version_count ?? 1)}`}</DetailRow>
                    <DetailRow label="SHA-256">
                      <span className="font-mono text-xs">{document.current_checksum ?? document.checksum_sha256 ?? '—'}</span>
                    </DetailRow>
                    <DetailRow label="Storage driver">{document.storage_driver ?? 'local'}</DetailRow>
                    <DetailRow label="Downloads">{formatNumber(downloadCount)}</DetailRow>
                  </dl>
                </Card>

                <Card padded={false}>
                  <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Filing</h3>
                  <dl>
                    <DetailRow label="Module">{FILE_ENTITY_LABELS[document.entity_type] ?? document.entity_type}</DetailRow>
                    <DetailRow label="Record">
                      {href ? <Link href={href} className="text-brand-600 hover:underline">{document.entity_label ?? `#${document.entity_id}`}</Link> : (document.entity_label ?? '—')}
                    </DetailRow>
                    <DetailRow label="Category">{document.category ?? '—'}</DetailRow>
                    <DetailRow label="Tags">{document.tags ?? '—'}</DetailRow>
                    <DetailRow label="Access level">{FILE_ACCESS_LABELS[document.access_level] ?? document.access_level}</DetailRow>
                    <DetailRow label="Valid until">{document.expires_at ? formatDateTime(document.expires_at) : '—'}</DetailRow>
                    <DetailRow label="Uploaded by">
                      {document.uploaded_by_name ?? 'System'}
                      {document.uploaded_by_email ? <span className="block text-xs text-ink-muted">{document.uploaded_by_email}</span> : null}
                    </DetailRow>
                    <DetailRow label="Uploaded at">{formatDateTime(document.created_at)}</DetailRow>
                    <DetailRow label="Last revision">{document.current_uploaded_at ? formatDateTime(document.current_uploaded_at) : formatDateTime(document.created_at)}</DetailRow>
                    <DetailRow label="Document id">
                      <span className="font-mono text-xs">{document.uuid}</span>
                    </DetailRow>
                  </dl>
                </Card>

                {document.description && (
                  <Card className="lg:col-span-2">
                    <h3 className="mb-2 text-sm font-semibold text-ink">Description</h3>
                    <p className="whitespace-pre-line text-sm text-ink-soft">{document.description}</p>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'versions',
            label: 'Versions',
            badge: Number(document.version_count ?? 1),
            content: (
              <Card padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Version history</h3>
                    <p className="text-xs text-ink-muted">
                      Every revision is stored immutably with its own checksum; the newest one is what the download buttons serve.
                    </p>
                  </div>
                  {canEdit && !archived && (
                    <Button size="sm" variant="outline" onClick={() => { setChangeNote(''); setVersionOpen(true); }}>
                      Upload New Version
                    </Button>
                  )}
                </div>
                <DataTable<VersionRow>
                  columns={versionColumns}
                  data={versionRows}
                  rowKey={(row) => row.id}
                  emptyTitle="No versions recorded"
                  emptySubtitle="Upload a revision to start the history."
                />
              </Card>
            ),
          },
          {
            key: 'activity',
            label: 'Activity',
            content: <ComplianceActivity entityType={document.entity_type} entityId={document.id} title="Document activity" />,
          },
        ]}
      />

      <FileMetadataModal
        file={editOpen ? document : null}
        onClose={() => setEditOpen(false)}
        onSaved={() => router.refresh()}
      />

      {/* New revision: the bytes land as the next immutable version. */}
      <Modal
        open={versionOpen}
        onClose={() => setVersionOpen(false)}
        title="Upload a new version"
        description={`v${Number(current.version) + 1} of ${document.original_name} — the previous revision stays downloadable.`}
        size="lg"
        footer={<Button variant="outline" onClick={() => setVersionOpen(false)}>Close</Button>}
      >
        <div className="space-y-4">
          <Input
            label="Change note" value={changeNote} placeholder="What changed in this revision?"
            onChange={(event) => setChangeNote(event.target.value)}
          />
          {versionOpen && (
            <FileUpload
              endpoint={`/api/admin/files/${document.id}/versions`}
              extraFields={{ changeNote }}
              label="New revision"
              helper="One file per revision — old revisions remain in the history."
              onUploaded={(files) => {
                const uploaded = files[0];
                success('New revision uploaded', `${uploaded?.original_name ?? 'The file'} is now the current revision; earlier versions stay downloadable.`);
                setVersionOpen(false);
                router.refresh();
              }}
              onError={(message) => errorToast('Upload failed', message)}
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete}
        onClose={() => setPendingDelete(false)}
        onConfirm={archive}
        loading={deleting}
        title="Archive this document?"
        message={`${document.original_name} leaves the active listing. The file and all ${Number(document.version_count ?? 1)} stored version(s) are retained and can be restored.`}
        confirmLabel="Archive Document"
        variant="danger"
      />
    </div>
  );
}
