'use client';

/**
 * Act & Compliance by audit type, following the client's sheet.
 *   a search list of the audit types; choosing one opens a table of Act / Chapter / Section / Sub Section / Amendments / Explain,
 *   and per row a Legal Compliance Register (Forms, Returns, Statement / Declaration) of Word files.
 * An administrator types and uploads; an auditor reads and downloads the same data.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';

const KINDS = ['Forms', 'Returns', 'Statement/Declaration'] as const;
type Kind = (typeof KINDS)[number];
const KIND_LABEL: Record<Kind, string> = { Forms: 'Forms', Returns: 'Returns', 'Statement/Declaration': 'Statement / Declaration' };

interface TypeRow { id: number; name: string; status: string; rows: number; forms: number; returns: number; statements: number }
interface Doc { id: number; kind: Kind; title: string; file_id: number; name: string; size: number }
interface Row { id: number; act_name: string; chapter: string; section: string; sub_section: string; amendments: string; explain_text: string; docs: Doc[] }
interface Detail { type: { id: number; name: string; status: string }; acts: string[]; rows: Row[] }
interface AllDoc { id: number; kind: string; title: string; file_id: number; name: string; size: number; type_id: number; type_name: string; act_name: string }

const cell = 'focus-ring w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-surface-muted';
const FIELDS = ['act_name', 'chapter', 'section', 'sub_section', 'amendments', 'explain_text'] as const;
const size = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function ComplianceRegister({ mode }: { mode: 'admin' | 'auditor' }) {
  const admin = mode === 'admin';
  const { success, error: errorToast } = useToast();
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [docs, setDocs] = useState<AllDoc[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<TypeRow | null>(null);

  const load = useCallback(async () => {
    const [list, all] = await Promise.all([api.get<TypeRow[]>('/api/compliance-register/types'), api.get<AllDoc[]>('/api/compliance-register/documents')]);
    if (list.ok && Array.isArray(list.data)) setTypes(list.data);
    if (all.ok && Array.isArray(all.data)) setDocs(all.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addType() {
    const result = await api.post('/api/compliance-register/types', { name: newName });
    if (!result.ok) { errorToast('Could not add it', result.message); return; }
    success('Audit type added');
    setAdding(false); setNewName('');
    await load();
  }

  async function removeType() {
    if (!removing) return;
    const result = await api.delete(`/api/compliance-register/types/${removing.id}`);
    setRemoving(null);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Removed');
    await load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold text-ink">Act, Rules, Regulation, Notification</h2>
          <p className="mb-3 text-sm text-ink-muted">Search the audit or assessment, and its Acts, Chapters, Sections and the Legal Compliance Register open.</p>
          <Select
            label="Search"
            searchable
            options={(types ?? []).filter((type) => admin || type.status === 'active').map((type) => ({ value: String(type.id), label: type.name }))}
            value=""
            onChange={(value) => { if (value) setOpenId(Number(value)); }}
            placeholder="Type to search, e.g. fire, HAZOP, labour"
          />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Audits and assessments"
          description="Open one to see its Acts and Legal Compliance Register."
          action={admin ? <Button size="sm" onClick={() => setAdding(true)}>+ Add audit type</Button> : undefined}
        />
        <CardBody>
          {types === null ? <p className="py-6 text-center text-sm text-ink-muted">Loading...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-3 font-semibold">Audit / assessment</th>
                    <th className="px-2 py-2 text-center font-semibold">Acts</th>
                    <th className="px-2 py-2 text-center font-semibold">Forms</th>
                    <th className="px-2 py-2 text-center font-semibold">Returns</th>
                    <th className="px-2 py-2 text-center font-semibold">Statements</th>
                    <th className="py-2 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {types.map((type) => (
                    <tr key={type.id} className={type.status === 'inactive' ? 'opacity-60' : undefined}>
                      <td className="py-2.5 pr-3">
                        <button type="button" onClick={() => setOpenId(type.id)} className="text-left font-medium text-ink hover:text-brand-600">{type.name}</button>
                      </td>
                      <td className="px-2 py-2.5 text-center">{type.rows}</td>
                      <td className="px-2 py-2.5 text-center">{type.forms}</td>
                      <td className="px-2 py-2.5 text-center">{type.returns}</td>
                      <td className="px-2 py-2.5 text-center">{type.statements}</td>
                      <td className="whitespace-nowrap py-2.5 pl-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setOpenId(type.id)}>{admin ? 'Open' : 'View'}</Button>
                        {admin && <button type="button" onClick={() => setRemoving(type)} className="ml-3 text-xs font-semibold text-red-600 hover:underline">Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="All Word documents" description="Every Form, Return and Statement / Declaration kept in the register." />
        <CardBody>
          {docs.length === 0 ? <p className="py-4 text-center text-sm text-ink-muted">No documents have been uploaded yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-3 font-semibold">Document</th>
                    <th className="px-2 py-2 font-semibold">Register</th>
                    <th className="px-2 py-2 font-semibold">Act</th>
                    <th className="px-2 py-2 font-semibold">Audit / assessment</th>
                    <th className="py-2 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {docs.map((doc) => (
                    <tr key={doc.id}>
                      <td className="py-2.5 pr-3 text-ink">{doc.title}<span className="ml-2 text-xs text-ink-muted">{doc.name} · {size(doc.size)}</span></td>
                      <td className="px-2 py-2.5">{KIND_LABEL[doc.kind as Kind] ?? doc.kind}</td>
                      <td className="px-2 py-2.5">{doc.act_name || '-'}</td>
                      <td className="px-2 py-2.5"><button type="button" onClick={() => setOpenId(doc.type_id)} className="text-left text-brand-600 hover:underline">{doc.type_name}</button></td>
                      <td className="py-2.5 pl-3 text-right"><a href={`/api/files/${doc.file_id}/download`} className="text-xs font-semibold text-brand-600 hover:underline">Download</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {openId && <RegisterModal key={openId} typeId={openId} admin={admin} onClose={() => { setOpenId(null); void load(); }} />}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an audit type"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={addType} disabled={newName.trim().length < 3}>Add</Button></div>}
      >
        <Input label="Audit or assessment" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Noise and Vibration Survey" />
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this audit type?"
        message={removing ? `"${removing.name}" and its Acts and register documents are removed from the list.` : ''}
        confirmLabel="Remove"
        onConfirm={removeType}
      />
    </div>
  );
}

/* ───────────────────────────── the table of one audit type ───────────────────────────── */

type Draft = Omit<Row, 'docs'> & { docs: Doc[]; isNew?: boolean };
const blank = (id: number): Draft => ({ id, act_name: '', chapter: '', section: '', sub_section: '', amendments: '', explain_text: '', docs: [], isNew: true });

function RegisterModal({ typeId, admin, onClose }: { typeId: number; admin: boolean; onClose: () => void }) {
  const { success, error: errorToast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [kinds, setKinds] = useState<Record<number, Kind | ''>>({});
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [removeRow, setRemoveRow] = useState<Draft | null>(null);
  const [tempId, setTempId] = useState(-1);

  const load = useCallback(async () => {
    const result = await api.get<Detail>(`/api/compliance-register/types/${typeId}`);
    if (!result.ok || !result.data) { errorToast('Could not open it', result.message); return; }
    setDetail(result.data);
    setRows((current) => {
      const fresh = result.data!.rows.map((row) => ({ ...row }));
      return [...fresh, ...current.filter((row) => row.isNew)];
    });
  }, [typeId, errorToast]);
  useEffect(() => { void load(); }, [load]);

  const saved = useMemo(() => new Map((detail?.rows ?? []).map((row) => [row.id, row])), [detail]);
  const dirty = (row: Draft) => row.isNew || FIELDS.some((field) => (saved.get(row.id)?.[field] ?? '') !== row[field]);
  const patch = (id: number, field: (typeof FIELDS)[number], value: string) => setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  async function save(row: Draft) {
    setBusy(row.id);
    setErrors((current) => ({ ...current, [row.id]: {} }));
    const body = Object.fromEntries(FIELDS.map((field) => [field, row[field]]));
    const result = row.isNew
      ? await api.post<{ id: number }>(`/api/compliance-register/types/${typeId}/rows`, body)
      : await api.put(`/api/compliance-register/rows/${row.id}`, body);
    setBusy(null);
    if (!result.ok) { setErrors((current) => ({ ...current, [row.id]: fieldErrors(result) })); errorToast('Could not save', result.message); return; }
    success('Saved');
    setRows((current) => current.filter((entry) => entry.id !== row.id));
    await load();
  }

  async function deleteRow() {
    const row = removeRow;
    setRemoveRow(null);
    if (!row) return;
    if (row.isNew) { setRows((current) => current.filter((entry) => entry.id !== row.id)); return; }
    const result = await api.delete(`/api/compliance-register/rows/${row.id}`);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Row removed');
    setRows((current) => current.filter((entry) => entry.id !== row.id));
    await load();
  }

  const header = (label: string, wide?: boolean) => <th scope="col" className={`px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted ${wide ? 'min-w-[14rem]' : 'min-w-[9rem]'}`}>{label}</th>;

  return (
    <Modal open onClose={onClose} title={detail?.type.name ?? 'Loading...'} description={admin ? 'Type the Acts, then keep the Forms, Returns and Statements as Word files.' : 'Acts, sections and the Legal Compliance Register.'} size="full">
      {!detail ? <p className="py-10 text-center text-sm text-ink-muted">Loading...</p> : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[78rem] text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  {header('Act')}{header('Chapter')}{header('Section')}{header('Sub Section')}{header('Amendments', true)}{header('Explain', true)}{header('Legal Compliance Register')}
                  <th className="w-40" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-muted">{admin ? 'No Act has been added for this yet. Choose "Add" below.' : 'Nothing has been added for this yet.'}</td></tr>
                )}
                {rows.map((row) => {
                  const kind = kinds[row.id] ?? '';
                  const list = row.docs.filter((doc) => !kind || doc.kind === kind);
                  const rowErrors = errors[row.id] ?? {};
                  return (
                    <Fragment key={row.id}>
                      <tr className="border-t border-line align-top">
                        {admin ? (
                          <>
                            <td className="p-2">
                              <input list="register-acts" value={row.act_name} onChange={(event) => patch(row.id, 'act_name', event.target.value)} placeholder="e.g. Factories Act 1948" className={cell} aria-label="Act" />
                              {rowErrors.act_name && <p className="error-text">{rowErrors.act_name}</p>}
                            </td>
                            <td className="p-2"><input value={row.chapter} onChange={(event) => patch(row.id, 'chapter', event.target.value)} className={cell} aria-label="Chapter" /></td>
                            <td className="p-2"><input value={row.section} onChange={(event) => patch(row.id, 'section', event.target.value)} className={cell} aria-label="Section" /></td>
                            <td className="p-2"><input value={row.sub_section} onChange={(event) => patch(row.id, 'sub_section', event.target.value)} className={cell} aria-label="Sub Section" /></td>
                            <td className="p-2"><textarea rows={3} value={row.amendments} onChange={(event) => patch(row.id, 'amendments', event.target.value)} className={cell} aria-label="Amendments" /></td>
                            <td className="p-2"><textarea rows={3} value={row.explain_text} onChange={(event) => patch(row.id, 'explain_text', event.target.value)} className={cell} aria-label="Explain" /></td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 font-medium text-ink">{row.act_name || '-'}</td>
                            <td className="p-3">{row.chapter || '-'}</td>
                            <td className="p-3">{row.section || '-'}</td>
                            <td className="p-3">{row.sub_section || '-'}</td>
                            <td className="whitespace-pre-line p-3">{row.amendments || '-'}</td>
                            <td className="whitespace-pre-line p-3">{row.explain_text || '-'}</td>
                          </>
                        )}
                        <td className="p-2">
                          <select
                            value={kind}
                            onChange={(event) => setKinds((current) => ({ ...current, [row.id]: event.target.value as Kind | '' }))}
                            className={cell}
                            aria-label="Legal Compliance Register"
                            disabled={row.isNew}
                          >
                            <option value="">{row.isNew ? 'Save the row first' : `Choose (${row.docs.length} files)`}</option>
                            {KINDS.map((value) => <option key={value} value={value}>{KIND_LABEL[value]} ({row.docs.filter((doc) => doc.kind === value).length})</option>)}
                          </select>
                        </td>
                        <td className="whitespace-nowrap p-2 text-right">
                          {admin && <Button size="sm" onClick={() => save(row)} loading={busy === row.id} disabled={!dirty(row) || !row.act_name.trim()}>Save</Button>}
                          {admin && <button type="button" onClick={() => setRemoveRow(row)} className="ml-3 text-xs font-semibold text-red-600 hover:underline">Delete</button>}
                        </td>
                      </tr>
                      {kind && !row.isNew && (
                        <tr className="bg-surface-muted/60">
                          <td colSpan={8} className="px-4 py-3">
                            <DocPanel rowId={row.id} kind={kind} docs={list} admin={admin} onChanged={load} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <datalist id="register-acts">{detail.acts.map((act) => <option key={act} value={act} />)}</datalist>
          {admin && <Button variant="outline" onClick={() => { setRows((current) => [...current, blank(tempId)]); setTempId((value) => value - 1); }}>+ Add</Button>}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(removeRow)}
        onClose={() => setRemoveRow(null)}
        title="Remove this row?"
        message="The row and its register documents are removed."
        confirmLabel="Remove"
        onConfirm={deleteRow}
      />
    </Modal>
  );
}

function DocPanel({ rowId, kind, docs, admin, onChanged }: { rowId: number; kind: Kind; docs: Doc[]; admin: boolean; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function add() {
    if (!file) return;
    setSaving(true);
    const body = new FormData();
    body.append('kind', kind);
    body.append('title', title);
    body.append('files', file);
    const result = await apiFetch(`/api/compliance-register/rows/${rowId}/documents`, { method: 'POST', body });
    setSaving(false);
    if (!result.ok) { errorToast('Could not add the document', result.message); return; }
    success('Document added');
    setTitle(''); setFile(null); setInputKey((value) => value + 1);
    onChanged();
  }

  async function remove(doc: Doc) {
    const result = await api.delete(`/api/compliance-register/documents/${doc.id}`);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Document removed');
    onChanged();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">{KIND_LABEL[kind]}</p>
      {docs.length === 0 ? <p className="text-sm text-ink-muted">No Word file has been added under {KIND_LABEL[kind]} yet.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0"><span className="font-medium text-ink">{doc.title}</span><span className="ml-2 text-xs text-ink-muted">{doc.name} · {size(doc.size)}</span></span>
              <span className="flex items-center gap-4 text-xs font-semibold">
                <a href={`/api/files/${doc.file_id}/download`} className="text-brand-600 hover:underline">View</a>
                <a href={`/api/files/${doc.file_id}/download`} download className="text-brand-600 hover:underline">Download</a>
                {admin && <button type="button" onClick={() => remove(doc)} className="text-red-600 hover:underline">Delete</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1"><Input label="Name (optional)" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Form 12: Register of adult workers" /></div>
          <div>
            <span className="label">Word file</span>
            <input key={inputKey} type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block text-sm" />
          </div>
          <Button size="sm" onClick={add} loading={saving} disabled={!file}>Add</Button>
        </div>
      )}
    </div>
  );
}
