'use client';

/**
 * A small type-to-search picker backed by /api/capar/lookups (the Acts register, the uploaded Act / Rule documents).
 * The chosen record shows as a chip; the editor can also ignore it and type the Act by hand, which is the normal case.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/utils/api-client';

export interface Option { value: string; label: string; hint?: string; text?: string | null; amendments?: string[]; actId?: number }

export function LookupPicker({ label, helper, type, selected, onSelect, placeholder, disabled }: {
  label: string;
  helper?: string;
  type: 'acts' | 'resources' | 'provisions';
  selected: { id: number; label: string } | null;
  onSelect: (value: Option | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function away(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      const result = await api.get<Option[]>(`/api/capar/lookups?type=${type}&q=${encodeURIComponent(term)}`);
      setOptions(result.ok && Array.isArray(result.data) ? result.data : []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [term, open, type]);

  return (
    <div ref={box} className="relative w-full">
      <span className="label">{label}</span>
      {selected ? (
        <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 text-sm">
          <span className="truncate text-ink">{selected.label}</span>
          {!disabled && (
            <button type="button" onClick={() => onSelect(null)} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
              Clear
            </button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={term}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setTerm(event.target.value); setOpen(true); }}
          placeholder={placeholder ?? 'Search...'}
          className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 disabled:bg-surface-muted"
        />
      )}
      {helper && !selected && <p className="helper">{helper}</p>}
      {open && !selected && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg" role="listbox">
          {loading && <li className="px-3 py-2 text-xs text-ink-muted">Searching...</li>}
          {!loading && options.length === 0 && <li className="px-3 py-2 text-xs text-ink-muted">Nothing found. You can type the reference by hand.</li>}
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => { onSelect(option); setOpen(false); setTerm(''); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="block text-ink">{option.label}</span>
                {option.hint && <span className="block truncate text-xs text-ink-muted">{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
