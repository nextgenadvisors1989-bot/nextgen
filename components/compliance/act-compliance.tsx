'use client';

/**
 * Act & Compliance: one table of Act / Chapter / Section / Sub Section / Amendments / Explain. Each row has a Legal Compliance Register
 * (Forms, Returns, Statement / Declaration): a button for each opens a popup where the record is typed in and saved.
 * "Add Act & Compliance" (administrator) opens the popup for a new row. An auditor reads the same table.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';

const KINDS = [['Forms', 'Forms'], ['Returns', 'Returns'], ['Statement/Declaration', 'Statement / Declaration']] as const;
type Kind = (typeof KINDS)[number][0];

interface RecordItem { id: number; kind: Kind; title: string; content: string; file_id: number | null; file_name: string | null }
interface Row { id: number; act_name: string; chapter: string; section: string; sub_section: string; amendments: string; explain_text: string; records: RecordItem[] }
interface Data { acts: string[]; rows: Row[] }
const EMPTY = { act_name: '', chapter: '', section: '', sub_section: '', amendments: '', explain_text: '' };
type Form = typeof EMPTY;

export function ActCompliance({ mode }: { mode: 'admin' | 'auditor' }) {
  const admin = mode === 'admin';
  const { success, error: errorToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: number | null } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [register, setRegister] = useState<{ rowId: number; kind: Kind } | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<Data>('/api/compliance-register/rows');
    if (result.ok && result.data) setData(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (row?: Row) => {
    setForm(row ? { act_name: row.act_name, chapter: row.chapter, section: row.section, sub_section: row.sub_section, amendments: row.amendments, explain_text: row.explain_text } : EMPTY);
    setErrors({});
    setEditing({ id: row?.id ?? null });
  };

  async function save() {
    setSaving(true);
    setErrors({});
    const result = editing?.id ? await api.put(`/api/compliance-register/rows/${editing.id}`, form) : await api.post('/api/compliance-register/rows', form);
    setSaving(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not save', result.message); return; }
    success('Saved');
    setEditing(null);
    await load();
  }

  async function remove() {
    if (!removing) return;
    const result = await api.delete(`/api/compliance-register/rows/${removing.id}`);
    setRemoving(null);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Removed');
    await load();
  }

  const needle = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((row) => !needle || `${row.act_name} ${row.chapter} ${row.section} ${row.sub_section} ${row.explain_text}`.toLowerCase().includes(needle));
  const activeRow = data?.rows.find((row) => row.id === register?.rowId) ?? null;
  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-96"><Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Act, chapter, section..." /></div>
            {admin && <Button onClick={() => open()}>Add Act &amp; Compliance</Button>}
          </div>
        </CardBody>
      </Card>

      <Card padded={false}>
        {data === null ? <p className="py-10 text-center text-sm text-ink-muted">Loading...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[70rem] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  {['Act', 'Chapter', 'Section', 'Sub Section', 'Amendments', 'Explain', 'Legal Compliance Register'].map((head) => <th key={head} scope="col" className="px-3 py-3 font-semibold">{head}</th>)}
                  {admin && <th scope="col" className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.length === 0 && <tr><td colSpan={admin ? 8 : 7} className="px-4 py-10 text-center text-ink-muted">{admin ? 'Nothing added yet. Choose "Add Act & Compliance".' : 'Nothing has been added yet.'}</td></tr>}
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-3 font-medium text-ink">{row.act_name}</td>
                    <td className="px-3 py-3">{row.chapter || '-'}</td>
                    <td className="px-3 py-3">{row.section || '-'}</td>
                    <td className="px-3 py-3">{row.sub_section || '-'}</td>
                    <td className="max-w-[16rem] whitespace-pre-line px-3 py-3">{row.amendments || '-'}</td>
                    <td className="max-w-[18rem] whitespace-pre-line px-3 py-3">{row.explain_text || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        {KINDS.map(([kind, label]) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setRegister({ rowId: row.id, kind })}
                            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-1.5 text-left text-xs font-semibold text-ink-soft hover:bg-surface-muted"
                          >
                            {label}
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">{row.records.filter((record) => record.kind === kind).length}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                    {admin && (
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <button type="button" onClick={() => open(row)} className="text-xs font-semibold text-brand-600 hover:underline">Edit</button>
                        <button type="button" onClick={() => setRemoving(row)} className="ml-3 text-xs font-semibold text-red-600 hover:underline">Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Act & Compliance' : 'Add Act & Compliance'}
        description="Type the Act with its Chapter, Section and Sub Section. The Forms, Returns and Statements are added from the table afterwards."
        size="xl"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={saving} disabled={!form.act_name.trim()}>Save</Button></div>}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="act-name" className="label">Act<span className="ml-0.5 text-red-500">*</span></label>
            <input id="act-name" list="act-names" value={form.act_name} onChange={(event) => set('act_name')(event.target.value)} placeholder="e.g. Factories Act 1948" className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400" />
            <datalist id="act-names">{(data?.acts ?? []).map((act) => <option key={act} value={act} />)}</datalist>
            {errors.act_name && <p className="error-text">{errors.act_name}</p>}
          </div>
          <Input label="Chapter" value={form.chapter} onChange={(event) => set('chapter')(event.target.value)} placeholder="e.g. Chapter IV: Safety" />
          <Input label="Section" value={form.section} onChange={(event) => set('section')(event.target.value)} placeholder="e.g. Section 38" />
          <Input label="Sub Section" value={form.sub_section} onChange={(event) => set('sub_section')(event.target.value)} placeholder="e.g. 38(1)" />
          <div className="md:col-span-2"><Textarea label="Amendments" rows={3} value={form.amendments} onChange={(event) => set('amendments')(event.target.value)} /></div>
          <div className="md:col-span-2"><Textarea label="Explain" rows={5} value={form.explain_text} onChange={(event) => set('explain_text')(event.target.value)} /></div>
        </div>
      </Modal>

      {activeRow && register && (
        <RegisterPopup key={`${activeRow.id}-${register.kind}`} row={activeRow} kind={register.kind} admin={admin} onClose={() => setRegister(null)} onChanged={load} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this row?"
        message="The row and its Forms, Returns and Statements are removed."
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  );
}

/* ───────────────────────────── the typed records of one register ───────────────────────────── */

function RegisterPopup({ row, kind, admin, onClose, onChanged }: { row: Row; kind: Kind; admin: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const { success, error: errorToast } = useToast();
  const label = KINDS.find(([value]) => value === kind)?.[1] ?? kind;
  const records = row.records.filter((record) => record.kind === kind);
  const [editingId, setEditingId] = useState<number | 'new' | null>(admin && records.length === 0 ? 'new' : null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function start(record?: RecordItem) {
    setTitle(record?.title ?? '');
    setContent(record?.content ?? '');
    setFile(null);
    setFileKey((value) => value + 1);
    setErrors({});
    setEditingId(record?.id ?? 'new');
  }

  async function save() {
    setSaving(true);
    setErrors({});
    let result;
    if (editingId === 'new') {
      const form = new FormData();
      form.append('kind', kind); form.append('title', title); form.append('content', content);
      if (file) form.append('files', file);
      result = await apiFetch(`/api/compliance-register/rows/${row.id}/records`, { method: 'POST', body: form });
    } else {
      result = await api.put(`/api/compliance-register/records/${editingId}`, { title, content });
    }
    setSaving(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not save', result.message); return; }
    success('Saved');
    setEditingId(null);
    await onChanged();
  }

  async function remove(record: RecordItem) {
    const result = await api.delete(`/api/compliance-register/records/${record.id}`);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Removed');
    await onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`${label}: ${row.act_name}`} description={[row.chapter, row.section, row.sub_section].filter(Boolean).join(' · ') || undefined} size="xl">
      <div className="space-y-4">
        {records.length === 0 && editingId === null && <p className="py-6 text-center text-sm text-ink-muted">Nothing has been recorded under {label} yet.</p>}
        {records.map((record) => (
          <article key={record.id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{record.title}</h3>
              {admin && (
                <span className="flex gap-3 text-xs font-semibold">
                  <button type="button" onClick={() => start(record)} className="text-brand-600 hover:underline">Edit</button>
                  <button type="button" onClick={() => void remove(record)} className="text-red-600 hover:underline">Delete</button>
                </span>
              )}
            </div>
            {record.content && <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{record.content}</p>}
            {record.file_id && <a href={`/api/files/${record.file_id}/download`} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">Word file: {record.file_name}</a>}
          </article>
        ))}

        {admin && editingId === null && <Button variant="outline" onClick={() => start()}>+ Add {label}</Button>}

        {admin && editingId !== null && (
          <div className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
            <Input label="Name" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'Forms' ? 'e.g. Form 12: Register of adult workers' : kind === 'Returns' ? 'e.g. Form 22: Half yearly return' : 'e.g. Fire safety declaration'} error={errors.title} />
            <Textarea label="Details" rows={8} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Type the form, the return or the declaration here." error={errors.content} />
            {editingId === 'new' && (
              <div>
                <span className="label">Word file (optional)</span>
                <input key={fileKey} type="file" accept=".doc,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block text-sm" />
                {errors.files && <p className="error-text">{errors.files}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button onClick={save} loading={saving} disabled={title.trim().length < 2}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
