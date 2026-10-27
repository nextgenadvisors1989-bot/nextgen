'use client';

import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { formatBytes } from '@/lib/utils/formatting';
import { ALLOWED_MIME_TYPES } from '@/types/file';

export interface UploadedFileMeta {
  id: number;
  original_name: string;
  url: string;
  size_bytes: number;
  mime_type: string | null;
}

export interface FileUploadProps {
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  multiple?: boolean;
  entityType?: string;
  entityId?: number | null;
  category?: string;
  /** Override the POST target (the admin vault uses /api/admin/files). */
  endpoint?: string;
  /** Extra multipart fields — access level, description, tags, expiry … */
  extraFields?: Record<string, string>;
  onUploaded?: (files: UploadedFileMeta[]) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  helper?: string;
  required?: boolean;
}

/** Drag-and-drop uploader that POSTs to /api/files/upload. */
export function FileUpload({
  label, accept, maxSizeMb = 25, multiple = false, entityType = 'OTHER', entityId = null,
  category, endpoint = '/api/files/upload', extraFields, onUploaded, onError, disabled, helper, required,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<UploadedFileMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (fileList: File[]) => {
      setError(null);
      const invalid = fileList.find(
        (file) => file.size > maxSizeMb * 1024 * 1024
      );
      if (invalid) {
        const message = `${invalid.name} exceeds the ${maxSizeMb} MB limit`;
        setError(message);
        onError?.(message);
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        for (const file of fileList) formData.append('files', file);
        if (entityType) formData.append('entityType', entityType);
        if (entityId) formData.append('entityId', String(entityId));
        if (category) formData.append('category', category);
        for (const [key, value] of Object.entries(extraFields ?? {})) {
          if (value !== undefined && value !== null && value !== '') formData.append(key, value);
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers: { 'X-CSRF-Token': getCsrfToken() },
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message ?? 'Upload failed');

        const uploaded: UploadedFileMeta[] = payload.files;
        setFiles((current) => (multiple ? [...current, ...uploaded] : uploaded));
        onUploaded?.(uploaded);
      } catch (uploadError) {
        const message = (uploadError as Error).message;
        setError(message);
        onError?.(message);
      } finally {
        setUploading(false);
      }
    },
    [entityType, entityId, category, endpoint, extraFields, maxSizeMb, multiple, onUploaded, onError]
  );

  return (
    <div className="w-full">
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          upload(Array.from(event.dataTransfer.files));
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors duration-150',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface-muted hover:border-brand-300',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept ?? ALLOWED_MIME_TYPES.join(',')}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length) upload(selected);
            event.target.value = '';
          }}
        />
        {uploading ? (
          <>
            <span className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm text-ink-soft">Uploading…</p>
          </>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="mb-2 text-brand-500">
              <path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-medium text-ink">
              <span className="text-brand-600">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              PDF, images, Word, Excel or CSV up to {maxSizeMb} MB{multiple ? ' — multiple files allowed' : ''}
            </p>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {helper && !error && <p className="helper">{helper}</p>}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-brand-50 text-xs font-semibold text-brand-700">
                  {(file.original_name.split('.').pop() ?? '').toUpperCase().slice(0, 4)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{file.original_name}</span>
                  <span className="block text-xs text-ink-muted">{formatBytes(file.size_bytes)}</span>
                </span>
              </span>
              <a href={file.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
