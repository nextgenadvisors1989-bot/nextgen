'use client';

import { useEffect, useRef, useState } from 'react';

/** Debounced search box with clear button; optionally keyboard-focused with "/". */
export function SearchInput({ value, onChange, placeholder = 'Search…', debounceMs = 400, autoFocusKey }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  autoFocusKey?: string;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (!autoFocusKey) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === autoFocusKey && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [autoFocusKey]);

  const handleChange = (next: string) => {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), debounceMs);
  };

  return (
    <div className="relative w-full sm:max-w-xs">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        ref={inputRef}
        value={local}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        className="focus-ring h-10 w-full rounded-lg border border-line bg-white pl-9 pr-9 text-sm text-ink placeholder:text-slate-400"
        aria-label={placeholder}
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal('');
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Clear search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Search box with an autocomplete suggestion list. */
export function AutocompleteInput({ value, onChange, suggestions, placeholder = 'Search…', loading, onSelect }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: { value: string; label: string; hint?: string }[];
  placeholder?: string;
  loading?: boolean;
  onSelect?: (item: { value: string; label: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative w-full sm:max-w-md" ref={wrapperRef}>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
      />
      {open && (value || suggestions.length > 0) && (
        <ul className="animate-slide-down absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
          {!loading && suggestions.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches found</li>}
          {suggestions.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => {
                  onSelect?.(item);
                  onChange(item.label);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="block text-ink">{item.label}</span>
                {item.hint && <span className="block text-xs text-ink-muted">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
