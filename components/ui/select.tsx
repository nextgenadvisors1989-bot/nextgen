'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

/** A control fills its container unless the caller gave it a width of its own (then it sits inline). */
function hasOwnWidth(className?: string): boolean {
  return Boolean(className && /(^|\s)(w|min-w|max-w)-/.test(className));
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps {
  label?: string;
  error?: string;
  helper?: string;
  options: SelectOption[];
  value?: string | number | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Dropdown with optional type-to-search and clear-to-empty. Used everywhere a
 * lookup needs autocomplete (employer, auditor, module, employee pickers).
 */
export function Select({
  label, error, helper, options, value, onChange, placeholder = 'Select…',
  searchable = false, clearable = false, disabled, required, name, className, size = 'md',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query, searchable]);

  const grouped = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const option of filtered) {
      const key = option.group ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(option);
    }
    return [...map.entries()];
  }, [filtered]);

  const selected = options.find((option) => String(option.value) === String(value ?? ''));

  return (
    <div className={clsx(!hasOwnWidth(className) && 'w-full', className)} ref={containerRef}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          name={name}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          className={clsx(
            'focus-ring flex w-full items-center justify-between rounded-lg border bg-white text-left text-sm',
            size === 'sm' ? 'h-8 px-2.5' : 'h-10 px-3',
            error ? 'border-red-400' : 'border-line',
            disabled ? 'cursor-not-allowed bg-surface-muted text-ink-muted' : 'text-ink'
          )}
        >
          <span className={clsx('truncate', !selected && 'text-slate-400')}>{selected?.label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange?.('');
                }}
                className="rounded p-0.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label="Clear selection"
              >
                ×
              </span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={clsx('transition-transform', open && 'rotate-180')}>
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {open && (
          <div className="animate-slide-down absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            {searchable && (
              <div className="border-b border-line p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search…"
                  className="focus-ring h-8 w-full rounded-md border border-line px-2 text-sm"
                />
              </div>
            )}
            <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
              {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches found</li>}
              {grouped.map(([groupName, groupOptions]) => (
                <li key={groupName || 'default'}>
                  {groupName && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{groupName}</p>}
                  <ul>
                    {groupOptions.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={String(option.value) === String(value ?? '')}
                          disabled={option.disabled}
                          onClick={() => {
                            onChange?.(String(option.value));
                            setOpen(false);
                            setQuery('');
                          }}
                          className={clsx(
                            'w-full px-3 py-2 text-left text-sm transition-colors duration-150',
                            String(option.value) === String(value ?? '')
                              ? 'bg-brand-50 font-medium text-brand-700'
                              : 'text-ink hover:bg-surface-muted',
                            option.disabled && 'cursor-not-allowed opacity-50'
                          )}
                        >
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
}

export function MultiSelect({ label, options, values, onChange, error, helper }: {
  label?: string;
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
  helper?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <div className={clsx('rounded-lg border bg-white', error ? 'border-red-400' : 'border-line')}>
        <div className="flex flex-wrap gap-1.5 p-2">
          {values.map((value) => {
            const option = options.find((o) => o.value === value);
            return (
              <span key={value} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                {option?.label ?? value}
                <button type="button" onClick={() => toggle(value)} className="text-brand-600 hover:text-brand-800" aria-label={`Remove ${option?.label ?? value}`}>
                  ×
                </button>
              </span>
            );
          })}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={values.length ? '' : 'Search and select…'}
            className="h-7 min-w-[120px] flex-1 border-0 px-1 text-sm focus:outline-none"
          />
        </div>
        {query && (
          <ul className="max-h-48 overflow-y-auto border-t border-line py-1">
            {filtered.slice(0, 50).map((option) => (
              <li key={option.value}>
                <button type="button" onClick={() => toggle(option.value)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted">
                  {option.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>}
          </ul>
        )}
      </div>
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
}
