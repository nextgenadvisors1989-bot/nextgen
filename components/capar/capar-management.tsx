'use client';

/**
 * CAPAR Management (administrator): the sections and documents of a CAPAR report, and which auditors work on each of them.
 * Every document lists the auditors who see it; choose them in a popup (many at once). A whole section can be given to a group of auditors
 * in one go, and "Suggest from auditor type" fills the gaps (it only adds). A document nobody is assigned to is shown to no auditor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';

interface Auditor { id: number; name: string; type_name: string | null; type_code: string | null }
interface Doc { id: number; name: string; group_name: string | null; auditor_ids: number[] }
interface Section { id: number; name: string; items: Doc[] }
interface Data { auditors: Auditor[]; sections: Section[]; unassigned: number }

type Target = { kind: 'doc'; doc: Doc } | { kind: 'section'; section: Section };

export function CaparManagement() {
  const { success, error: errorToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [auditorFilter, setAuditorFilter] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [confirmSuggest, setConfirmSuggest] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<Data>('/api/admin/capar/management');
    if (!result.ok || !result.data) { setLoadError(result.message || 'Could not load CAPAR Management'); return; }
    setLoadError(null);
    setData(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const auditorById = useMemo(() => new Map((data?.auditors ?? []).map((auditor) => [auditor.id, auditor])), [data]);
  const needle = search.trim().toLowerCase();
  const filterId = auditorFilter ? Number(auditorFilter) : null;

  if (loadError) return <Card><CardBody><p className="py-8 text-center text-sm text-red-600">{loadError}</p></CardBody></Card>;
  if (!data) return <Card><CardBody><p className="py-8 text-center text-sm text-ink-muted">Loading...</p></CardBody></Card>;

  const total = data.sections.reduce((sum, section) => sum + section.items.length, 0);
  const toggle = (id: number) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function suggest() {
    setSuggesting(true);
    const result = await api.post<{ added: number }>('/api/admin/capar/management/suggest', {});
    setSuggesting(false);
    setConfirmSuggest(false);
    if (!result.ok) { errorToast('Could not apply the suggestions', result.message); return; }
    success('Suggestions applied', `${result.data?.added ?? 0} assignments added`);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-ink">
                <strong>{total}</strong> documents in <strong>{data.sections.length}</strong> sections
                {data.unassigned > 0
                  ? <> · <strong className="text-amber-700">{data.unassigned}</strong> not given to any auditor yet</>
                  : <> · every document has an auditor</>}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                An auditor sees only the documents given to them, in the CAPAR reports they write.
                {' '}To add or rename a document, use <Link href="/admin/audit-documents" className="font-medium text-brand-600 hover:underline">Audit Documents</Link>.
              </p>
            </div>
            <Button variant="outline" onClick={() => setConfirmSuggest(true)}>Suggest from auditor type</Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Search documents" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. fire, payroll, licence" />
            <Select
              label="Show only the documents of"
              options={data.auditors.map((auditor) => ({ value: String(auditor.id), label: `${auditor.name}${auditor.type_name ? ` (${auditor.type_name})` : ''}` }))}
              value={auditorFilter}
              onChange={setAuditorFilter}
              placeholder="All auditors"
              searchable
              clearable
            />
          </div>
        </CardBody>
      </Card>

      {data.sections.map((section) => {
        const rows = section.items.filter((doc) => (!needle || doc.name.toLowerCase().includes(needle)) && (!filterId || doc.auditor_ids.includes(filterId)));
        if ((needle || filterId) && !rows.length) return null;
        const unassigned = section.items.filter((doc) => !doc.auditor_ids.length).length;
        const expanded = needle || filterId ? true : open.has(section.id);
        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button type="button" onClick={() => toggle(section.id)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold text-ink">{section.name}</span>
                <span className="block text-xs text-ink-muted">
                  {section.items.length} documents{unassigned > 0 && <span className="text-amber-700"> · {unassigned} not assigned</span>}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'section', section })}>Assign whole section</Button>
                <button type="button" onClick={() => toggle(section.id)} aria-label={expanded ? 'Close section' : 'Open section'} className="p-1 text-ink-muted">
                  <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            {expanded && (
              <ul className="divide-y divide-line border-t border-line">
                {rows.map((doc) => {
                  const names = doc.auditor_ids.map((id) => auditorById.get(id)?.name).filter(Boolean) as string[];
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 text-sm text-ink">{doc.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {names.length === 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Not assigned</span>}
                        {names.slice(0, 3).map((name) => <span key={name} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{name}</span>)}
                        {names.length > 3 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600" title={names.slice(3).join(', ')}>+{names.length - 3}</span>}
                        <Button size="sm" variant="outline" onClick={() => setTarget({ kind: 'doc', doc })}>Choose auditors</Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {target && (
        <AuditorPicker
          key={target.kind === 'doc' ? `d${target.doc.id}` : `s${target.section.id}`}
          target={target}
          auditors={data.auditors}
          onClose={() => setTarget(null)}
          onSaved={async () => { setTarget(null); await load(); }}
        />
      )}

      <ConfirmDialog
        open={confirmSuggest}
        onClose={() => setConfirmSuggest(false)}
        variant="primary"
        title="Suggest auditors for the documents?"
        message="Each document is given to the auditors whose type suits it, for example Fire Safety auditors get the fire documents and Payroll auditors the wage documents. Only missing assignments are added. Nothing you set is removed. You can change any of it afterwards."
        confirmLabel="Add suggestions"
        loading={suggesting}
        onConfirm={suggest}
      />
    </div>
  );
}

function AuditorPicker({ target, auditors, onClose, onSaved }: { target: Target; auditors: Auditor[]; onClose: () => void; onSaved: () => void }) {
  const { success, error: errorToast } = useToast();
  const isSection = target.kind === 'section';
  const initial = target.kind === 'doc' ? target.doc.auditor_ids : [];
  const [selected, setSelected] = useState<Set<number>>(new Set(initial));
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const needle = search.trim().toLowerCase();
  const shown = auditors.filter((auditor) => !needle || `${auditor.name} ${auditor.type_name ?? ''}`.toLowerCase().includes(needle));
  const flip = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const title = target.kind === 'doc' ? target.doc.name : target.section.name;

  async function save() {
    setSaving(true);
    const ids = [...selected];
    const result = target.kind === 'doc'
      ? await api.put(`/api/admin/capar/management/items/${target.doc.id}`, { auditor_ids: ids })
      : await api.put(`/api/admin/capar/management/sections/${target.section.id}`, { auditor_ids: ids, mode });
    setSaving(false);
    if (!result.ok) { errorToast('Could not save', result.message); return; }
    success('Saved');
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isSection ? `Assign the whole section: ${title}` : title}
      description={isSection ? `The chosen auditors are given all ${target.kind === 'section' ? target.section.items.length : 0} documents of this section.` : 'Tick every auditor who should see this document in a CAPAR report.'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={isSection && selected.size === 0 && mode === 'add'}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Search auditors" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or type, e.g. fire" />
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{selected.size} selected</span>
          <span className="space-x-3">
            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => setSelected(new Set([...selected, ...shown.map((auditor) => auditor.id)]))}>Select all shown</button>
            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => setSelected(new Set([...selected].filter((id) => !shown.some((auditor) => auditor.id === id))))}>Clear shown</button>
          </span>
        </div>
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {shown.map((auditor) => (
            <li key={auditor.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-line" checked={selected.has(auditor.id)} onChange={() => flip(auditor.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{auditor.name}</span>
                  {auditor.type_name && <span className="block text-xs text-ink-muted">{auditor.type_name}</span>}
                </span>
              </label>
            </li>
          ))}
          {!shown.length && <li className="px-3 py-4 text-center text-sm text-ink-muted">No auditor matches.</li>}
        </ul>
        {isSection && (
          <fieldset className="space-y-2">
            <legend className="label">What to do with the documents of this section</legend>
            {([['add', 'Add these auditors to every document', 'Auditors already on a document stay.'], ['set', 'Replace: only these auditors on every document', 'Anyone else is taken off all documents of this section.']] as const).map(([value, text, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2 hover:bg-surface-muted">
                <input type="radio" name="mode" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
                <span><span className="block text-sm text-ink">{text}</span><span className="block text-xs text-ink-muted">{hint}</span></span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
