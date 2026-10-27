'use client';

import { useState } from 'react';
import { FileUpload, getCsrfToken, type UploadedFileMeta } from './file-upload';
import { formatBytes } from '@/lib/utils/formatting';

/** Multi-file queue with progress list and client-side removal. */
export function MultiFileUpload({ label = 'Attachments', entityType, entityId, category, onUploaded, accept, maxFiles = 20 }: {
  label?: string;
  entityType?: string;
  entityId?: number | null;
  category?: string;
  onUploaded?: (files: UploadedFileMeta[]) => void;
  accept?: string;
  maxFiles?: number;
}) {
  const [files, setFiles] = useState<UploadedFileMeta[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);

  const handleRemove = async (fileId: number) => {
    setRemoving(fileId);
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (response.ok) {
        setFiles((current) => current.filter((file) => file.id !== fileId));
      }
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <FileUpload
        label={label}
        multiple
        accept={accept}
        entityType={entityType}
        entityId={entityId}
        category={category}
        onUploaded={(uploaded) => {
          const next = [...files, ...uploaded].slice(0, maxFiles);
          setFiles(next);
          onUploaded?.(next);
        }}
      />
      {files.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          {files.length} of {maxFiles} files attached
        </p>
      )}
      {files.length >= maxFiles && (
        <p className="error-text">Maximum of {maxFiles} attachments reached</p>
      )}
      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{file.original_name}</span>
                <span className="block text-xs text-ink-muted">{formatBytes(file.size_bytes)}</span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(file.id)}
                disabled={removing === file.id}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {removing === file.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
