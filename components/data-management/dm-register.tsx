'use client';

/**
 * One register: enter a record, see the records, correct / verify / delete them, and see the totals for each day, week, month or financial year.
 * The form is drawn from the register catalogue (lib/data-management/registers.ts), so every register works the same way; calculated fields
 * are worked out live as the numbers are typed (the server works them out again when it saves).
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { applyCalcs, type Bucket } from '@/lib/data-management/calc';
import { aggOf, type FieldDef, type RegisterDef } from '@/lib/data-management/registers';
import { CompanyPicker, NoCompanyYet, PeriodBar, fmt, todayIso, useCatalogue, withCompany, type Catalogue, type DmContext } from './dm-common';

interface EntryRow {
  id: number; entry_date: string; shift: string | null; data: Record<string, unknown>; remarks: string | null; status: string; verify_note: string | null; entered_by: number; entered_by_name: string | null; file_count?: number;
  files?: { id: number; file_id: number; caption: string | null; name: string; url: string }[];
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = { verified: 'success', entered: 'warning', rejected: 'danger' };
const INPUT = 'focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-500';

function monthStart() { return `${todayIso().slice(0, 7)}-01`; }

export function RegisterScreen({ ctx, code }: { ctx: DmContext; code: string }) {
  const { catalogue, error } = useCatalogue();
  const register = catalogue?.registers.find((entry) => entry.code === code);
  if (error) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>;
  if (!catalogue) return <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>;
  if (!register) return <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">There is no register {code}. <Link href={ctx.basePath} className="font-medium underline">Back to Data Management</Link></p>;
  return <Inner ctx={ctx} catalogue={catalogue} register={register} />;
}

function Inner({ ctx, catalogue, register }: { ctx: DmContext; catalogue: Catalogue; register: RegisterDef }) {
  const { success, error: errorToast } = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [tab, setTab] = useState<'records' | 'totals'>('records');
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [can, setCan] = useState({ write: catalogue.can.write, verify: catalogue.can.verify });
  const [editing, setEditing] = useState<EntryRow | 'new' | null>(null);
  const [suggest, setSuggest] = useState<Record<string, string[]>>({});
  const company = ctx.employerId;
  const blocked = ctx.needsCompany && !company;

  const load = useCallback(async () => {
    if (blocked) return;
    setLoading(true);
    const result = await api.get<EntryRow[]>(withCompany(`/api/data-management/entries?register=${register.code}&from=${from}&to=${to}&page=${page}&limit=25${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, company));
    setLoading(false);
    if (!result.ok) { errorToast(result.message); return; }
    setRows(Array.isArray(result.data) ? result.data : []);
    setPages(result.pagination?.totalPages ?? 1);
    setTotal(result.pagination?.total ?? 0);
    const extra = result.raw as { can?: { write: boolean; verify: boolean } };
    if (extra?.can) setCan(extra.can);
  }, [blocked, register.code, from, to, page, status, q, company, errorToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [from, to, status, q]);
  useEffect(() => {
    if (blocked || !register.fields.some((field) => field.suggest)) return;
    void api.get<{ suggestions: Record<string, string[]> }>(withCompany(`/api/data-management/suggest?register=${register.code}`, company)).then((result) => {
      const raw = result.raw as { suggestions?: Record<string, string[]> };
      if (result.ok && raw?.suggestions) setSuggest(raw.suggestions);
    });
  }, [blocked, register.code, company, rows.length]);

  async function decide(row: EntryRow, decision: 'verify' | 'reject' | 'reopen') {
    let note = '';
    if (decision === 'reject') { note = window.prompt('Why is this record rejected?') ?? ''; if (!note.trim()) return; }
    const result = await api.post(withCompany(`/api/data-management/entries/${row.id}/verify`, company), { decision, note });
    if (!result.ok) { errorToast(result.message); return; }
    success(result.message);
    void load();
  }
  async function remove(row: EntryRow) {
    if (!window.confirm(`Delete the ${register.code} record of ${row.entry_date}? This is written to the audit trail.`)) return;
    const result = await api.delete(withCompany(`/api/data-management/entries/${row.id}`, company));
    if (!result.ok) { errorToast(result.message); return; }
    success(result.message);
    void load();
  }

  const columns = register.columns.map((key) => register.fields.find((field) => field.key === key)).filter((field): field is FieldDef => Boolean(field));
  const exportHref = withCompany(`/api/data-management/export?register=${register.code}&from=${from}&to=${to}`, company);

  return (
    <div className="space-y-5">
      {ctx.needsCompany && <CompanyPicker employerId={company} />}
      {blocked ? <NoCompanyYet /> : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <p className="font-mono text-xs font-semibold text-ink-muted">{register.code} · {register.frequency} · {register.module}</p>
                <h2 className="text-lg font-semibold text-ink">{register.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">{register.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can.write && <Button onClick={() => setEditing('new')}>Enter a record</Button>}
                {catalogue.can.export && <a href={exportHref} className="focus-ring inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted">Download CSV</a>}
              </div>
            </div>
            {!can.write && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-soft">You are looking at these records only; nothing can be entered or changed from this login.</p>}
          </Card>

          <PeriodBar from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />

          <div role="tablist" aria-label="View" className="flex gap-1 border-b border-line">
            {([['records', 'Records'], ['totals', 'Daily · weekly · monthly · annual totals']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`focus-ring -mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}>{label}</button>
            ))}
          </div>

          {tab === 'records' ? (
            <Card padded={false}>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <input aria-label="Search the records" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search…" className={`${INPUT} max-w-xs`} />
                <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${INPUT} max-w-[11rem]`}>
                  <option value="">All statuses</option><option value="entered">Waiting to be verified</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
                </select>
                <span className="ml-auto text-sm text-ink-muted">{total} record{total === 1 ? '' : 's'}</span>
              </div>
              <div className="relative overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      {register.shift && <th className="px-3 py-2.5 font-semibold">Shift</th>}
                      {columns.map((field) => <th key={field.key} className="px-3 py-2.5 font-semibold">{field.label}{field.unit ? <span className="block font-normal normal-case text-ink-muted">{field.unit}</span> : null}</th>)}
                      <th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top hover:bg-surface-muted/60">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{row.entry_date}</td>
                        {register.shift && <td className="px-3 py-2.5">{row.shift ?? '—'}</td>}
                        {columns.map((field) => <td key={field.key} className={`px-3 py-2.5 ${field.type === 'number' || field.type === 'calc' ? 'text-right tabular-nums' : ''}`}>{fmt(row.data[field.key])}</td>)}
                        <td className="px-3 py-2.5">
                          <Badge tone={STATUS_TONE[row.status] ?? 'default'}>{row.status === 'entered' ? 'To verify' : row.status}</Badge>
                          {row.verify_note && <span className="mt-1 block max-w-[12rem] text-xs text-ink-muted">{row.verify_note}</span>}
                          {row.entered_by_name && <span className="mt-1 block text-xs text-ink-muted">{row.entered_by_name}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <button type="button" onClick={() => setEditing(row)} className="focus-ring rounded px-2 py-1 text-sm font-medium text-brand-700 hover:underline">{can.write ? 'Open / correct' : 'Open'}</button>
                          {can.verify && row.status !== 'verified' && <button type="button" onClick={() => void decide(row, 'verify')} className="focus-ring rounded px-2 py-1 text-sm font-medium text-emerald-700 hover:underline">Verify</button>}
                          {can.verify && row.status === 'entered' && <button type="button" onClick={() => void decide(row, 'reject')} className="focus-ring rounded px-2 py-1 text-sm font-medium text-red-700 hover:underline">Reject</button>}
                          {can.verify && row.status === 'verified' && <button type="button" onClick={() => void decide(row, 'reopen')} className="focus-ring rounded px-2 py-1 text-sm text-ink-muted hover:underline">Re-open</button>}
                          {can.verify && <button type="button" onClick={() => void remove(row)} className="focus-ring rounded px-2 py-1 text-sm text-ink-muted hover:text-red-700 hover:underline">Delete</button>}
                        </td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={columns.length + 4} className="px-4 py-10 text-center text-ink-muted">{loading ? 'Loading…' : can.write ? 'No records in this period yet. Press “Enter a record”.' : 'No records in this period.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-ink-muted">Page {page} of {pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </Card>
          ) : (
            <Totals register={register} from={from} to={to} company={company} />
          )}

          {editing && (
            <RecordModal
              key={editing === 'new' ? 'new' : editing.id}
              register={register} catalogue={catalogue} entry={editing === 'new' ? null : editing} canWrite={can.write} suggest={suggest} company={company}
              onClose={() => setEditing(null)} onSaved={() => { void load(); }}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── totals ───────────────────────────── */

function Totals({ register, from, to, company }: { register: RegisterDef; from: string; to: string; company: number | null }) {
  const { error: errorToast } = useToast();
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [data, setData] = useState<{ buckets: Bucket[]; total: Record<string, number | null>; count: number; split: { value: string; count: number; values: Record<string, number | null> }[] } | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    void api.get(withCompany(`/api/data-management/series?register=${register.code}&granularity=${granularity}&from=${from}&to=${to}`, company)).then((result) => {
      if (!live) return;
      if (!result.ok) { errorToast(result.message); return; }
      setData(result.raw as never);
    });
    return () => { live = false; };
  }, [register.code, granularity, from, to, company, errorToast]);

  const numeric = register.fields.filter((field) => (field.type === 'number' && aggOf(field) !== 'none') || field.type === 'calc');
  const cols = numeric.slice(0, 14);
  const how = (field: FieldDef) => (field.type === 'calc' ? 'worked out from the totals' : { sum: 'added up', avg: 'average', last: 'last value', max: 'highest', none: '' }[aggOf(field)]);
  const table = (rows: { label: string; count: number; values: Record<string, number | null> }[], firstHead: string) => (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr><th className="px-4 py-2.5 font-semibold">{firstHead}</th><th className="px-3 py-2.5 text-right font-semibold">Records</th>
            {cols.map((field) => <th key={field.key} className="px-3 py-2.5 text-right font-semibold" title={how(field)}>{field.label}{field.unit ? <span className="block font-normal normal-case">{field.unit}</span> : null}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-surface-muted/60"><td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{row.label}</td><td className="px-3 py-2.5 text-right tabular-nums">{row.count}</td>
              {cols.map((field) => <td key={field.key} className="px-3 py-2.5 text-right tabular-nums">{fmt(row.values[field.key])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Totals for each">
        <span className="text-sm text-ink-soft">Totals for each</span>
        {(['day', 'week', 'month', 'year'] as const).map((g) => (
          <button key={g} type="button" aria-pressed={granularity === g} onClick={() => setGranularity(g)} className={`focus-ring rounded-full border px-3 py-1 text-sm ${granularity === g ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft hover:border-brand-500'}`}>{g === 'year' ? 'financial year' : g}</button>
        ))}
      </div>
      {!data ? <p className="py-8 text-center text-sm text-ink-muted">Loading…</p> : !data.count ? <p className="rounded-lg border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-ink-muted">No records in this period.</p> : (
        <>
          <Card padded={false}>{table([...data.buckets.map((b) => ({ label: b.label, count: b.count, values: b.values })), { label: 'Whole period', count: data.count, values: data.total }], granularity === 'year' ? 'Financial year' : granularity === 'week' ? 'Week (Monday)' : granularity === 'month' ? 'Month' : 'Day')}</Card>
          {data.split.length > 1 && register.splitBy && (
            <Card padded={false}>
              <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">By {register.fields.find((f) => f.key === register.splitBy)?.label.toLowerCase()} (whole period)</h3>
              {table(data.split.map((s) => ({ label: s.value, count: s.count, values: s.values })), register.fields.find((f) => f.key === register.splitBy)?.label ?? 'Item')}
            </Card>
          )}
          <p className="text-xs text-ink-muted">Quantities are added up, readings and stock show the last value, rates are worked out again from the totals (so a percentage is weighted, not an average of percentages).</p>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── the form ───────────────────────────── */

function RecordModal({ register, catalogue, entry, canWrite, suggest, company, onClose, onSaved }: {
  register: RegisterDef; catalogue: Catalogue; entry: EntryRow | null; canWrite: boolean; suggest: Record<string, string[]>; company: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const readOnly = !canWrite;
  const initial = useMemo(() => Object.fromEntries(register.fields.filter((f) => f.type !== 'calc').map((f) => [f.key, entry?.data[f.key] === undefined ? '' : String(entry.data[f.key])])), [register, entry]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [date, setDate] = useState(entry?.entry_date ?? todayIso());
  const [shift, setShift] = useState(entry?.shift ?? 'A');
  const [remarks, setRemarks] = useState(entry?.remarks ?? '');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState(entry?.files ?? []);

  const numeric = useMemo(() => Object.fromEntries(register.fields.filter((f) => f.type !== 'calc').map((f) => [f.key, f.type === 'number' ? (values[f.key] === '' ? '' : Number(values[f.key])) : values[f.key]])), [register, values]);
  const calculated = useMemo(() => applyCalcs(register, numeric), [register, numeric]);

  useEffect(() => {
    if (!entry) return;
    void api.get<{ entry: EntryRow }>(withCompany(`/api/data-management/entries/${entry.id}`, company)).then((result) => {
      const raw = result.raw as { entry?: EntryRow };
      if (result.ok && raw?.entry?.files) setFiles(raw.entry.files);
    });
  }, [entry, company]);

  async function save(another: boolean) {
    setSaving(true);
    setIssues({});
    const body = { register: register.code, entry_date: date, shift: register.shift ? shift : undefined, remarks, values, employer_id: company ?? undefined };
    const result = entry ? await api.put(withCompany(`/api/data-management/entries/${entry.id}`, company), body) : await api.post('/api/data-management/entries', body);
    setSaving(false);
    if (!result.ok) {
      const mapped: Record<string, string> = {};
      if (Array.isArray(result.errors)) for (const issue of result.errors) mapped[issue.field] = issue.message;
      setIssues(mapped);
      errorToast(result.message);
      return;
    }
    success(result.message);
    onSaved();
    if (another) { setValues(Object.fromEntries(Object.keys(initial).map((k) => [k, '']))); return; }
    onClose();
  }

  async function upload(list: FileList | null) {
    if (!list?.length || !entry) return;
    const form = new FormData();
    for (const file of Array.from(list)) form.append('files', file);
    if (company) form.append('employer_id', String(company));
    const csrf = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/)?.[1] ?? '';
    const response = await fetch(withCompany(`/api/data-management/entries/${entry.id}/files`, company), { method: 'POST', body: form, headers: { 'x-csrf-token': decodeURIComponent(csrf) } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) { errorToast(payload?.message ?? 'Upload failed'); return; }
    success(payload.message);
    const again = await api.get<{ entry: EntryRow }>(withCompany(`/api/data-management/entries/${entry.id}`, company));
    const raw = again.raw as { entry?: EntryRow };
    if (raw?.entry?.files) setFiles(raw.entry.files);
    onSaved();
  }
  async function detach(linkId: number) {
    if (!entry) return;
    const result = await api.delete(withCompany(`/api/data-management/entries/${entry.id}/files/${linkId}`, company));
    if (result.ok) setFiles(files.filter((f) => f.id !== linkId)); else errorToast(result.message);
  }

  const ef = catalogue.factors;
  return (
    <Modal open onClose={onClose} size="xl" title={`${register.code} · ${entry ? (readOnly ? 'Record' : 'Open / correct the record') : 'Enter a record'}`} description={register.name}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && !entry && <Button variant="outline" onClick={() => void save(true)} loading={saving}>Save and add another</Button>}
          {!readOnly && <Button onClick={() => void save(false)} loading={saving}>{entry ? 'Save the correction' : 'Save'}</Button>}
        </div>
      }>
      <div className="space-y-5">
        {entry?.status === 'verified' && !readOnly && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This record was verified. A correction puts it back to “waiting to be verified” and is written to the audit trail.</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm"><span className="label">Date of the record <span className="text-red-600">*</span></span>
            <input type="date" value={date} max={todayIso()} disabled={readOnly} onChange={(event) => setDate(event.target.value)} className={INPUT} aria-invalid={Boolean(issues.entry_date)} />
            {issues.entry_date && <span className="mt-1 block text-xs text-red-600">{issues.entry_date}</span>}</label>
          {register.shift && (
            <label className="block text-sm"><span className="label">Shift</span>
              <select value={shift} disabled={readOnly} onChange={(event) => setShift(event.target.value)} className={INPUT}>{['A', 'B', 'C', 'GENERAL'].map((s) => <option key={s} value={s}>{s === 'GENERAL' ? 'General' : s}</option>)}</select></label>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {register.fields.map((field) => {
            const id = `dm-${register.code}-${field.key}`;
            const label = <span className="label">{field.label}{field.unit ? <span className="font-normal text-ink-muted"> ({field.unit})</span> : null}{field.required ? <span className="text-red-600"> *</span> : null}</span>;
            const error = issues[field.key];
            const common = { id, disabled: readOnly, 'aria-invalid': Boolean(error) } as const;
            let control: React.ReactNode;
            if (field.type === 'calc') {
              const value = calculated[field.key];
              control = <output id={id} className="flex h-10 items-center rounded-lg border border-dashed border-line bg-surface-muted px-3 text-sm font-semibold tabular-nums text-ink" aria-live="polite">{typeof value === 'number' ? fmt(value, 4) : <span className="font-normal text-ink-muted">worked out from the figures</span>}</output>;
            } else if (field.type === 'select') {
              const options = field.dynamic === 'ef' ? ef.map((f) => ({ value: f.ef_code, label: `${f.ef_code} · ${f.name} (per ${f.unit})` })) : (field.options ?? []).map((o) => ({ value: o, label: o }));
              control = <select {...common} value={values[field.key]} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className={INPUT}><option value="">Choose…</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
            } else if (field.type === 'textarea') {
              control = <textarea {...common} rows={2} value={values[field.key]} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="focus-ring w-full rounded-lg border border-line px-3 py-2 text-sm" />;
            } else {
              const listId = field.suggest && suggest[field.key]?.length ? `${id}-list` : undefined;
              control = (
                <>
                  <input {...common} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} step={field.type === 'number' ? 'any' : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} min={field.type === 'number' ? 0 : undefined}
                    list={listId} value={values[field.key]} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className={INPUT} autoComplete="off" />
                  {listId && <datalist id={listId}>{suggest[field.key].map((s) => <option key={s} value={s} />)}</datalist>}
                </>
              );
            }
            return (
              <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                <label htmlFor={id} className="block text-sm">{label}</label>
                {control}
                {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : field.hint ? <span className="mt-1 block text-xs text-ink-muted">{field.hint}</span> : null}
              </div>
            );
          })}
        </div>
        <label className="block text-sm"><span className="label">Remarks</span><textarea value={remarks} disabled={readOnly} rows={2} onChange={(event) => setRemarks(event.target.value)} className="focus-ring w-full rounded-lg border border-line px-3 py-2 text-sm" /></label>

        {entry && (
          <div className="rounded-lg border border-line p-3">
            <p className="text-sm font-semibold text-ink">Photographs and papers (meter photo, weighbridge slip, invoice)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2"><a href={`${file.url}?inline=true`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{file.name}</a>{!readOnly && <button type="button" onClick={() => void detach(file.id)} className="text-ink-muted hover:text-red-700">Remove</button>}</li>
              ))}
              {!files.length && <li className="text-ink-muted">Nothing attached.</li>}
            </ul>
            {!readOnly && <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface-muted focus-within:ring-2 focus-within:ring-brand-500">Attach files<input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} /></label>}
          </div>
        )}
        {!entry && !readOnly && <p className="text-xs text-ink-muted">Save the record first; then open it to attach a meter photograph or a weighbridge slip.</p>}
      </div>
    </Modal>
  );
}
