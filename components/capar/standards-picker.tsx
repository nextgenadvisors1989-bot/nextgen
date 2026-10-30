'use client';

/** A dropdown of the buyer standards (BSCI, SEDEX ...) with a tick for each one; the chosen ones are kept as "BSCI, SEDEX, SA8000". */
import { useEffect, useRef, useState } from 'react';

export const BUYER_STANDARDS = ['BSCI', 'SEDEX', 'FEMA', 'Oeko Tex', 'GRS', 'GOTS', 'OCS', 'RCS', 'WRAP', 'SLCP', 'Higg FEM', 'Higg FSLM', 'SA8000', 'ISO Standards', 'ZDHC'];

export const splitStandards = (value: string | null | undefined) => (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

export function StandardsPicker({ label = 'Buyer standards', value, onChange, disabled, error }: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const chosen = splitStandards(value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (name: string) => onChange((chosen.includes(name) ? chosen.filter((entry) => entry !== name) : [...chosen, name]).join(', '));

  return (
    <div ref={wrapper} className="relative">
      <span className="label">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`focus-ring flex min-h-[2.5rem] w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:bg-surface-muted ${error ? 'border-red-400' : 'border-line'}`}
      >
        <span className={chosen.length ? 'text-ink' : 'text-slate-400'}>{chosen.length ? chosen.join(', ') : 'Choose the standards'}</span>
        <svg className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg" role="listbox" aria-multiselectable>
          {BUYER_STANDARDS.map((name) => (
            <li key={name}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-line" checked={chosen.includes(name)} onChange={() => toggle(name)} />
                {name}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
