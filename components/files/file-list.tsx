'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatFileSize } from '@/lib/files/file-format';

export interface FileListEntry {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  version: number;
  category?: string | null;
  description?: string | null;
  created_at: string;
  uploaded_by_name?: string | null;
  download_url?: string;
  is_current_version?: boolean;
  version_count?: number;
}

/**
 * Compact document list used by assignment, report, employer and employee
 * detail pages. Versioning is first-class: the current version is downloadable,
 * older versions collapse into a "version history" reveal, and admins can
 * remove a document (the file row is soft-deleted so the trail survives).
 */
export function FileList({
  files, onChanged, canDelete = true, emptyMessage,
}: {
  files: FileListEntry[];
  onChanged?: () => void;
  canDelete?: boolean;
  emptyMessage?: string;
}) {
  const { success, error: errorToast } = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FileListEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!files.length) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-ink-muted">
        {emptyMessage ?? 'No documents uploaded yet.'}
      </p>
    );
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/files/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Document removed', `${pendingDelete.original_name} is no longer listed.`);
      setPendingDelete(null);
      onChanged?.();
    } else {
      errorToast('Could not remove document', result.message);
    }
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {files.map((file) => {
          const isOwner = canDelete;
          return (
            <li key={file.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
                    <path d="M14 2v5h5" />
                  </svg>
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{file.original_name}</p>
                  <p className="text-xs text-ink-muted">
                    {formatFileSize(file.size_bytes)} · v{file.version}
                    {file.category ? ` · ${file.category}` : ''}
                    {file.uploaded_by_name ? ` · ${file.uploaded_by_name}` : ''} · {formatDateTime(file.created_at)}
                  </p>
                </div>

                {Number(file.version_count ?? 1) > 1 && (
                  <button
                    type="button"
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() => setExpanded(expanded === file.id ? null : file.id)}
                  >
                    {expanded === file.id ? 'Hide versions' : `${file.version_count} versions`}
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <a
                    className="btn btn-outline btn-sm"
                    href={file.download_url ?? `/api/files/${file.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                  {file.mime_type === 'application/pdf' && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/api/files/${file.id}/download?inline=true`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  )}
                  {isOwner && (
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(file)} aria-label={`Delete ${file.original_name}`}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {expanded === file.id && (
                <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-ink-muted">
                  <p className="font-medium text-ink-soft">Version history</p>
                  <p>
                    Version {file.version} is the current revision, uploaded {formatDateTime(file.created_at)}
                    {file.uploaded_by_name ? ` by ${file.uploaded_by_name}` : ''}. Use{' '}
                    <span className="font-mono">/api/files/{file.id}</span> to inspect metadata, and upload a replacement
                    to create the next version.
                  </p>
                  <Badge tone="slate">v{file.version} current</Badge>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this document?"
        message={pendingDelete ? `${pendingDelete.original_name} will no longer be listed against this record. Previous versions stay in storage for the audit trail.` : ''}
        confirmLabel="Remove Document"
        variant="danger"
      />
    </>
  );
}
