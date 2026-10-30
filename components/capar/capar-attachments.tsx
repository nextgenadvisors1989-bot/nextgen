'use client';

/**
 * Photos and evidence on one finding: the files already saved, plus the ones chosen but not yet uploaded. Photos show as
 * thumbnails (the non-compliance image the auditor took on site); evidence shows as a file list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '@/lib/utils/formatting';
import type { CaparFile } from '@/types/capar';
import { CameraCapture } from '@/components/capar/camera-capture';

export function AttachmentPicker({ kind, label, helper, existing, queued, onQueue, onUnqueue, onRemoveExisting, disabled }: {
  kind: 'Photo' | 'Evidence';
  label: string;
  helper?: string;
  existing: CaparFile[];
  queued: File[];
  onQueue: (files: File[]) => void;
  onUnqueue: (index: number) => void;
  onRemoveExisting: (file: CaparFile) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Photos and documents both go in here: any picture or office document.
  const accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx';
  const phone = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const onPhone = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Object URLs for the queued images are created once per file list and released with it.
  const previews = useMemo(() => queued.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null)), [queued]);
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  const saved = existing.filter((file) => file.kind === kind);
  const isEmpty = saved.length === 0 && queued.length === 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label !mb-0">{label}</span>
        {!disabled && (
          <span className="flex items-center gap-3">
            {kind === 'Photo' && (
              <button type="button" onClick={() => (onPhone() ? phone.current?.click() : setCamera(true))} className="text-xs font-semibold text-brand-600 hover:underline">
                Take photo
              </button>
            )}
            <button type="button" onClick={() => input.current?.click()} className="text-xs font-semibold text-brand-600 hover:underline">
              + Add file
            </button>
          </span>
        )}
      </div>
      <input
        ref={phone}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          if (chosen.length) onQueue(chosen);
          event.target.value = '';
        }}
      />
      <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={(file) => onQueue([file])} />
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          if (chosen.length) onQueue(chosen);
          event.target.value = '';
        }}
      />

      {isEmpty ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-line px-3 py-5 text-sm text-ink-muted transition-colors hover:border-brand-300 hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
        >
          {disabled ? 'None attached' : kind === 'Photo' ? 'Click to add a photo or any document' : 'Click to attach the evidence'}
        </button>
      ) : kind === 'Photo' ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {saved.map((file) => (
            <li key={file.link_id} className="group relative overflow-hidden rounded-lg border border-line bg-surface-muted">
              {/^image\//.test(file.mime_type ?? '') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt={file.caption ?? file.original_name} className="h-24 w-full object-cover" />
              ) : (
                <a href={file.url} target="_blank" rel="noreferrer" className="flex h-24 items-center justify-center px-2 text-center text-xs text-brand-600 hover:underline">{file.original_name}</a>
              )}
              {!disabled && <RemoveButton onClick={() => onRemoveExisting(file)} label={`Remove ${file.original_name}`} />}
            </li>
          ))}
          {queued.map((file, index) => (
            <li key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-lg border border-dashed border-brand-300 bg-brand-50">
              {previews[index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[index] as string} alt={file.name} className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center px-2 text-xs text-ink-muted">{file.name}</div>
              )}
              <span className="absolute left-1 top-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Not saved yet</span>
              <RemoveButton onClick={() => onUnqueue(index)} label={`Remove ${file.name}`} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {saved.map((file) => (
            <li key={file.link_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <a href={file.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand-600 hover:underline">{file.original_name}</a>
              <span className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
                {formatBytes(file.size_bytes)}
                {!disabled && <button type="button" onClick={() => onRemoveExisting(file)} className="font-semibold text-red-600 hover:underline">Remove</button>}
              </span>
            </li>
          ))}
          {queued.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 bg-brand-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink">{file.name} <span className="text-xs text-ink-muted">(not saved yet)</span></span>
              <button type="button" onClick={() => onUnqueue(index)} className="shrink-0 text-xs font-semibold text-red-600 hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {helper && <p className="helper">{helper}</p>}
    </div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );
}
