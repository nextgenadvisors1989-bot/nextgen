'use client';

/** Shared pieces of the Data Management screens: types, the period bar, the company picker (administrator and auditors) and number formatting. */
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/utils/api-client';
import type { RegisterDef } from '@/lib/data-management/registers';

export interface DmContext {
  /** e.g. /employer/data-management */
  basePath: string;
  /** Administrator and auditors look at one company at a time. */
  employerId: number | null;
  needsCompany: boolean;
}

export interface Catalogue {
  registers: RegisterDef[];
  groups: string[];
  factors: { ef_code: string; name: string; scope: number; category: string; unit: string; activity_key: string }[];
  viewer: 'employer' | 'employee' | 'auditor' | 'admin';
  can: { read: boolean; write: boolean; verify: boolean; export: boolean };
}

export const withCompany = (url: string, employerId: number | null) => (employerId ? `${url}${url.includes('?') ? '&' : '?'}employer_id=${employerId}` : url);

export function fmt(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toLocaleString('en-IN', { maximumFractionDigits: digits });
  return String(value);
}

/** A financial year (April - March) as a from / to pair. */
export function fyOf(startYear: number) { return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` }; }
export function currentFyStart(now = new Date()): number {
  const local = new Date(now.getTime() + 5.5 * 3600_000);
  return local.getUTCMonth() + 1 >= 4 ? local.getUTCFullYear() : local.getUTCFullYear() - 1;
}
export const todayIso = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function useCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api.get<Catalogue>('/api/data-management/registers').then((result) => {
      if (result.ok) setCatalogue(result.raw as Catalogue);
      else setError(result.message);
    });
  }, []);
  return { catalogue, error };
}

/** Period presets: today, this week, this month, last month, this financial year, last financial year, or any two dates. */
export function PeriodBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const today = todayIso();
  const fy = currentFyStart();
  const first = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0));
  const lastMonthStart = `${lastMonthEnd.toISOString().slice(0, 8)}01`;
  const monday = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Today', from: today, to: today }, { label: 'This week', from: monday, to: today }, { label: 'This month', from: first, to: today },
    { label: 'Last month', from: lastMonthStart, to: lastMonthEnd.toISOString().slice(0, 10) },
    { label: `FY ${fy}-${String(fy + 1).slice(2)}`, from: fyOf(fy).from, to: fyOf(fy).to < today ? fyOf(fy).to : today },
    { label: `FY ${fy - 1}-${String(fy).slice(2)}`, from: fyOf(fy - 1).from, to: fyOf(fy - 1).to },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {presets.map((preset) => {
          const active = preset.from === from && preset.to === to;
          return (
            <button key={preset.label} type="button" onClick={() => onChange(preset.from, preset.to)} aria-pressed={active}
              className={`focus-ring rounded-full border px-3 py-1 text-sm ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft hover:border-brand-500'}`}>
              {preset.label}
            </button>
          );
        })}
      </div>
      <label className="text-sm text-ink-soft">From <input type="date" value={from} max={to} onChange={(event) => event.target.value && onChange(event.target.value, to)} className="focus-ring ml-1 h-9 rounded-lg border border-line px-2 text-sm" /></label>
      <label className="text-sm text-ink-soft">To <input type="date" value={to} min={from} onChange={(event) => event.target.value && onChange(from, event.target.value)} className="focus-ring ml-1 h-9 rounded-lg border border-line px-2 text-sm" /></label>
    </div>
  );
}

/** For an administrator or auditor: which company's data to look at. The choice lives in the address (?employer_id=), so a page can be shared. */
export function CompanyPicker({ employerId }: { employerId: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    void api.get<{ value: string; label: string; hint?: string }[]>('/api/capar/lookups?type=employers').then((result) => {
      if (result.ok && Array.isArray(result.data)) setOptions(result.data.map((entry) => ({ value: entry.value, label: entry.hint ? `${entry.label} (${entry.hint})` : entry.label })));
    });
  }, []);
  return (
    <div className="max-w-xl">
      <Select
        label="Company (a company and its factory are one)"
        searchable
        options={options}
        value={employerId ? String(employerId) : ''}
        placeholder="Choose the company whose data you want to see"
        onChange={(value) => {
          const next = new URLSearchParams(params.toString());
          if (value) next.set('employer_id', value); else next.delete('employer_id');
          router.replace(`${pathname}?${next.toString()}`);
        }}
      />
    </div>
  );
}

export function NoCompanyYet() {
  return <p className="rounded-lg border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">Choose a company above to see its Data Management records. You can look at any company; nothing here can be changed from this login.</p>;
}
