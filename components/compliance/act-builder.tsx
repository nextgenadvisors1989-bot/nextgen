'use client';

/**
 * Act builder (administrator): writes an Act the way the printed Act reads. Chapters (and schedules) are typed as a list, the sections of a chapter are typed as a list
 * ("1. Short title, extent and commencement."), and the text of every section is written in the Word-style editor, with its sub sections ((1), (2) ...) and its amendment
 * notes. The same tree feeds the public Act page, the auditor's Acts library and the CAPAR requirement search.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

const WordEditor = dynamic(() => import('@/components/ui/word-editor'), { ssr: false, loading: () => <div className="rounded-lg border border-line px-4 py-10 text-center text-sm text-ink-muted">Loading the editor…</div> });

type Kind = 'Chapter' | 'Section' | 'Sub Section' | 'Schedule';
interface TNode { id: number; parent_id: number | null; kind: Kind; number: string | null; title: string; status: string; has_body: boolean; children: TNode[] }
interface Tree { act: { id: number; act_name: string; subtitle: string | null }; tree: TNode[]; total: number }
interface Amend { amended_on: string; reference: string; description: string }
interface Loaded { id: number; kind: Kind; parent_id: number | null; number: string; title: string; status: string; body_html: string; amendments: Amend[] }
interface Line { number: string | null; title: string; body_html?: string }

const CHILD: Record<Kind, Kind | null> = { Chapter: 'Section', Schedule: 'Section', Section: 'Sub Section', 'Sub Section': null };
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => ROMAN.reduce((out, [v, s]) => { while (n >= v) { out += s; n -= v; } return out; }, '');
const label = (n: { kind: string; number: string | null; title: string }) => [n.kind === 'Chapter' ? `Chapter ${n.number ?? ''}`.trim() : n.kind === 'Section' ? (n.number ? `${n.number}.` : '') : n.number ?? '', n.title].filter(Boolean).join(' ');

/** What a typed line means for each level; a line that does not start with a number gets the next one. */
function parseLines(kind: Kind, text: string, existing: number): Line[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let counter = existing;
  return lines.map((raw) => {
    counter += 1;
    if (kind === 'Chapter') {
      const m = raw.match(/^(?:chapter\s+)?([IVXLCDM]+[A-Z]?|\d+[A-Z]?)\s*(?:[|:\-–—.]\s*|\s+)(.+)$/i);
      return m ? { number: m[1].toUpperCase(), title: m[2].trim() } : { number: roman(counter), title: raw };
    }
    if (kind === 'Schedule') {
      const m = raw.split('|');
      return m.length > 1 ? { number: m[0].trim(), title: m.slice(1).join('|').trim() } : { number: null, title: raw };
    }
    if (kind === 'Section') {
      const m = raw.match(/^(?:section\s+)?(\d+\s?-?[A-Z]{0,2})\s*[.)\]:\-–—]\s*(.+)$/i) ?? raw.match(/^(\d+[A-Z]{0,2})\s+(.+)$/i);
      return m ? { number: m[1].replace(/\s+/g, '').toUpperCase(), title: m[2].trim() } : { number: String(counter), title: raw };
    }
    const m = raw.match(/^(\([0-9A-Za-z]+\))\s*(.+)$/);
    const body = m ? m[2].trim() : raw;
    const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { number: m ? m[1] : `(${counter})`, title: body.slice(0, 120), body_html: `<p>${esc}</p>` };
  });
}

function flatten(nodes: TNode[], out: TNode[] = []) { for (const n of nodes) { out.push(n); flatten(n.children, out); } return out; }
function findNode(nodes: TNode[], id: number): TNode | null { for (const n of nodes) { if (n.id === id) return n; const f = findNode(n.children, id); if (f) return f; } return null; }
function pathOf(nodes: TNode[], id: number, trail: number[] = []): number[] | null {
  for (const n of nodes) { if (n.id === id) return trail; const f = pathOf(n.children, id, [...trail, n.id]); if (f) return f; }
  return null;
}

export function ActBuilder({ actId, canEdit }: { actId: number; canEdit: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Tree | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState<Loaded | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState<{ kind: Kind; parent: TNode | null } | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkCount, setBulkCount] = useState('');
  const [removing, setRemoving] = useState<TNode | null>(null);

  const load = useCallback(async () => {
    const response = await api.get<Tree>(`/api/admin/compliance/acts/${actId}/provisions`);
    if (response.ok && response.data) setData(response.data);
    setLoading(false);
  }, [actId]);
  useEffect(() => { void load(); }, [load]);

  const flat = useMemo(() => (data ? flatten(data.tree) : []), [data]);
  const topParts = useMemo(() => (data?.tree ?? []).filter((n) => n.kind === 'Chapter' || n.kind === 'Schedule'), [data]);

  async function select(id: number) {
    if (dirty && !window.confirm('The text you changed has not been saved. Leave it?')) return;
    setErrors({});
    const response = await api.get<{ id: number; kind: Kind; parent_id: number | null; number: string | null; title: string; status: string; body_html: string | null; explanation: string | null;
      amendments: { amended_on: string | null; reference: string | null; description: string }[] }>(`/api/admin/compliance/acts/${actId}/provisions/${id}`);
    if (!response.ok || !response.data) { toast.error('Could not open it', response.message); return; }
    const d = response.data;
    // a text that predates the editor is plain: show its lines as paragraphs
    const plain = (d.explanation ?? '').split(/\n+/).filter(Boolean).map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
    setForm({ id: d.id, kind: d.kind, parent_id: d.parent_id, number: d.number ?? '', title: d.title, status: d.status, body_html: d.body_html ?? plain,
      amendments: d.amendments.map((a) => ({ amended_on: a.amended_on ?? '', reference: a.reference ?? '', description: a.description })) });
    setSelected(id);
    setDirty(false);
    const trail = data ? pathOf(data.tree, id) : null;
    if (trail) setOpen((current) => ({ ...current, ...Object.fromEntries(trail.map((t) => [t, true])) }));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setErrors({});
    const response = await api.put(`/api/admin/compliance/acts/${actId}/provisions/${form.id}`, {
      kind: form.kind, parent_id: form.parent_id, number: form.number.trim() || null, title: form.title, status: form.status, body_html: form.body_html,
      amendments: form.amendments.filter((a) => a.description.trim()).map((a) => ({ amended_on: a.amended_on || null, reference: a.reference || null, description: a.description })),
    });
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error('Could not save', response.message); return; }
    toast.success('Saved');
    setDirty(false);
    await load();
  }

  async function submitBulk() {
    if (!bulk) return;
    const siblings = bulk.parent ? bulk.parent.children.length : (data?.tree ?? []).filter((n) => n.kind === bulk.kind).length;
    const lines = parseLines(bulk.kind, bulkText, siblings);
    if (!lines.length) return;
    setBusy(true);
    const response = await api.post<{ created: number; ids: number[] }>(`/api/admin/compliance/acts/${actId}/provisions/bulk`, {
      parent_id: bulk.parent?.id ?? null, nodes: lines.map((l) => ({ kind: bulk.kind, number: l.number, title: l.title, body_html: l.body_html, status: 'active' })),
    });
    setBusy(false);
    if (!response.ok) { toast.error('Could not add them', response.message); return; }
    toast.success(`${response.data?.created ?? lines.length} added`);
    const parentId = bulk.parent?.id;
    setBulk(null);
    setBulkText('');
    await load();
    if (parentId) setOpen((current) => ({ ...current, [parentId]: true }));
    if (bulk.kind !== 'Chapter' && bulk.kind !== 'Schedule' && response.data?.ids?.[0]) void select(response.data.ids[0]);
  }

  async function move(node: TNode, direction: -1 | 1) {
    const siblings = node.parent_id ? findNode(data?.tree ?? [], node.parent_id)?.children ?? [] : data?.tree ?? [];
    const index = siblings.findIndex((s) => s.id === node.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const response = await api.post(`/api/admin/compliance/acts/${actId}/provisions/reorder`, { ids });
    if (!response.ok) { toast.error('Could not move it', response.message); return; }
    await load();
  }

  async function remove() {
    if (!removing) return;
    const response = await api.delete(`/api/admin/compliance/acts/${actId}/provisions/${removing.id}`);
    setRemoving(null);
    if (!response.ok) { toast.error('Could not remove it', response.message); return; }
    toast.success('Removed');
    if (selected !== null && (selected === removing.id || flatten(removing.children).some((c) => c.id === selected))) { setSelected(null); setForm(null); setDirty(false); }
    await load();
  }

  function openBulk(kind: Kind, parent: TNode | null) {
    setBulk({ kind, parent });
    setBulkText('');
    setBulkCount('');
  }

  const set = <K extends keyof Loaded>(key: K, value: Loaded[K]) => { setForm((c) => (c ? { ...c, [key]: value } : c)); setDirty(true); };
  const setAmend = (i: number, key: keyof Amend, value: string) => { setForm((c) => (c ? { ...c, amendments: c.amendments.map((a, j) => (j === i ? { ...a, [key]: value } : a)) } : c)); setDirty(true); };

  const sectionsParents = topParts.map((n) => ({ value: String(n.id), label: label(n) }));
  const selectedNode = selected && data ? findNode(data.tree, selected) : null;
  const preview = bulk ? parseLines(bulk.kind, bulkText, bulk.parent ? bulk.parent.children.length : (data?.tree ?? []).filter((n) => n.kind === bulk.kind).length) : [];

  // a plain function (not a component) so the list is not rebuilt, and the focus not lost, on every keystroke elsewhere
  function renderRow(node: TNode, depth: number, siblings: number, index: number): React.ReactNode {
    const isOpen = open[node.id];
    const child = CHILD[node.kind];
    return (
      <li key={node.id}>
        <div className={`group flex items-center gap-1 rounded-md pr-1 ${selected === node.id ? 'bg-brand-50' : 'hover:bg-surface-muted'}`} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
          {node.children.length > 0 || child ? (
            <button type="button" onClick={() => setOpen((c) => ({ ...c, [node.id]: !isOpen }))} aria-expanded={Boolean(isOpen)} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label(node)}`}
              className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted hover:text-ink">{isOpen ? '▾' : '▸'}</button>
          ) : <span className="w-6 shrink-0" />}
          <button type="button" onClick={() => void select(node.id)} aria-current={selected === node.id ? 'true' : undefined}
            className="focus-ring min-w-0 flex-1 truncate rounded py-1.5 text-left text-sm text-ink">
            <span className={node.kind === 'Chapter' || node.kind === 'Schedule' ? 'font-semibold' : ''}>{label(node)}</span>
            {node.status !== 'active' && <span className="ml-1.5 text-xs capitalize text-ink-muted">({node.status})</span>}
            {!node.has_body && node.kind !== 'Chapter' && node.kind !== 'Schedule' && <span className="ml-1.5 text-xs text-amber-700" title="No text yet">•</span>}
          </button>
          {canEdit && (
            <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" onClick={() => void move(node, -1)} disabled={index === 0} aria-label={`Move ${label(node)} up`} className="focus-ring h-6 w-6 rounded text-ink-muted hover:text-ink disabled:opacity-30">↑</button>
              <button type="button" onClick={() => void move(node, 1)} disabled={index === siblings - 1} aria-label={`Move ${label(node)} down`} className="focus-ring h-6 w-6 rounded text-ink-muted hover:text-ink disabled:opacity-30">↓</button>
              {child && <button type="button" onClick={() => { setOpen((c) => ({ ...c, [node.id]: true })); openBulk(child, node); }} aria-label={`Add ${child.toLowerCase()}s under ${label(node)}`} title={`Add ${child.toLowerCase()}s`} className="focus-ring h-6 w-6 rounded font-semibold text-brand-600 hover:bg-white">+</button>}
              <button type="button" onClick={() => setRemoving(node)} aria-label={`Remove ${label(node)}`} className="focus-ring h-6 w-6 rounded text-red-600 hover:bg-white">×</button>
            </span>
          )}
        </div>
        {isOpen && node.children.length > 0 && (
          <ul>{node.children.map((c, i) => renderRow(c, depth + 1, node.children.length, i))}</ul>
        )}
      </li>
    );
  }

  const parentChoices = form && form.kind === 'Sub Section' ? flat.filter((n) => n.kind === 'Section').map((n) => ({ value: String(n.id), label: label(n) })) : sectionsParents;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">
          Write the Act as it is printed: its chapters, then the sections of each chapter, then the text of each section in the editor, with its sub sections and amendments.
          {data ? ` ${data.total} entries so far.` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button size="sm" onClick={() => openBulk('Chapter', null)}>Add chapters</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => openBulk('Schedule', null)}>Add schedules</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => openBulk('Section', selectedNode && (selectedNode.kind === 'Chapter' || selectedNode.kind === 'Schedule') ? selectedNode : null)}>
            {selectedNode && (selectedNode.kind === 'Chapter' || selectedNode.kind === 'Schedule') ? `Add sections to ${selectedNode.kind === 'Chapter' ? 'chapter' : 'schedule'} ${selectedNode.number ?? ''}`.trim() : 'Add sections'}
          </Button>}
          <Link href={`/admin/compliance/acts/${actId}/read`} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft hover:bg-surface-muted">Read the Act</Link>
        </div>
      </div>

      {loading ? <p className="py-10 text-center text-sm text-ink-muted">Loading…</p> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-xl border border-line">
            <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Arrangement of Sections</p>
            {!data || data.tree.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-muted">
                Nothing yet. Start with <strong>Add chapters</strong>: type one chapter on each line, for example <em>I | PRELIMINARY</em>.
              </div>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto p-2" aria-label="Chapters and sections">
                {data.tree.map((n, i) => renderRow(n, 0, data.tree.length, i))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            {!form ? (
              <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
                Choose a chapter or a section on the left to write its text, or add chapters and sections with the buttons above.
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-line p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Select label="Level" value={form.kind} onChange={(v) => set('kind', v as Kind)} options={['Chapter', 'Section', 'Sub Section', 'Schedule'].map((k) => ({ value: k, label: k }))} disabled={!canEdit} />
                  <Input label="Number" value={form.number} onChange={(e) => set('number', e.target.value)} error={errors.number} disabled={!canEdit}
                    placeholder={form.kind === 'Chapter' ? 'e.g. IV' : form.kind === 'Section' ? 'e.g. 21' : form.kind === 'Sub Section' ? 'e.g. (1)' : 'e.g. THE FIRST SCHEDULE'} />
                  <div className="md:col-span-2">
                    <Select label="Status" value={form.status} onChange={(v) => set('status', v)} disabled={!canEdit}
                      options={[{ value: 'active', label: 'In force' }, { value: 'repealed', label: 'Repealed' }, { value: 'omitted', label: 'Omitted' }]} />
                  </div>
                </div>
                {form.kind !== 'Chapter' && form.kind !== 'Schedule' && (
                  <Select label={form.kind === 'Section' ? 'Under chapter or schedule' : 'Under section'} value={form.parent_id ? String(form.parent_id) : ''} disabled={!canEdit}
                    onChange={(v) => set('parent_id', v ? Number(v) : null)} clearable={form.kind === 'Section'} searchable error={errors.parent_id}
                    placeholder={form.kind === 'Section' ? 'Directly under the Act' : 'Choose the section'}
                    options={parentChoices} />
                )}
                <Input label="Heading" requiredMark value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} disabled={!canEdit}
                  helper={form.kind === 'Sub Section' ? 'A short line to pick it by (the first words of the sub section).' : 'For a section, the heading as printed, for example "Short title, extent and commencement."'} />
                <WordEditor key={form.id} value={form.body_html} onChange={(html) => set('body_html', html)} label="Text" disabled={!canEdit} minHeight={280}
                  helper={form.kind === 'Section' ? 'If the section has sub sections, write only the words before sub section (1) here and add each sub section under it with the + button.' : undefined} />
                {errors.body_html && <p className="error-text">{errors.body_html}</p>}

                <div>
                  <div className="flex items-center justify-between">
                    <p className="label">Amendments and notes</p>
                    {canEdit && <Button size="sm" variant="outline" onClick={() => set('amendments', [...form.amendments, { amended_on: '', reference: String(form.amendments.length + 1), description: '' }])}>Add a note</Button>}
                  </div>
                  {form.amendments.length === 0 && <p className="mt-1 text-xs text-ink-muted">None recorded.</p>}
                  <div className="mt-2 space-y-2">
                    {form.amendments.map((a, i) => (
                      <div key={i} className="grid gap-2 rounded-lg border border-line p-2 md:grid-cols-[110px_150px_1fr_auto]">
                        <Input label="Mark" value={a.reference} onChange={(e) => setAmend(i, 'reference', e.target.value)} placeholder="1" disabled={!canEdit} />
                        <Input label="Date" type="date" value={a.amended_on} onChange={(e) => setAmend(i, 'amended_on', e.target.value)} disabled={!canEdit} />
                        <Textarea label="Note (for example: Subs. by Act 94 of 1976, s. 2)" rows={2} value={a.description} onChange={(e) => setAmend(i, 'description', e.target.value)} error={errors[`amendments.${i}.description`]} disabled={!canEdit} />
                        {canEdit && <div className="flex items-end"><Button size="sm" variant="ghost" onClick={() => set('amendments', form.amendments.filter((_, j) => j !== i))}>Remove</Button></div>}
                      </div>
                    ))}
                  </div>
                </div>

                {canEdit && (
                  <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white pt-3">
                    <p className="text-xs text-ink-muted" role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</p>
                    <div className="flex gap-2">
                      {CHILD[form.kind] && <Button variant="outline" onClick={() => { const n = findNode(data?.tree ?? [], form.id); if (n) openBulk(CHILD[form.kind] as Kind, n); }}>Add {CHILD[form.kind]?.toLowerCase()}s</Button>}
                      <Button onClick={save} loading={busy} disabled={!dirty}>Save</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={Boolean(bulk)} onClose={() => setBulk(null)} size="lg"
        title={bulk ? `Add ${bulk.kind === 'Sub Section' ? 'sub sections' : `${bulk.kind.toLowerCase()}s`}${bulk.parent ? ` to ${label(bulk.parent)}` : ''}` : ''}
        footer={<><Button variant="ghost" onClick={() => setBulk(null)}>Cancel</Button><Button onClick={submitBulk} loading={busy} disabled={preview.length === 0}>Add {preview.length || ''}</Button></>}>
        {bulk && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {bulk.kind === 'Chapter' && 'Type one chapter on each line: the number, a bar and the name, for example "I | PRELIMINARY". A line with only a name gets the next number.'}
              {bulk.kind === 'Schedule' && 'Type one schedule on each line, for example "THE FIRST SCHEDULE | List of industries involving hazardous processes". A line with only a name is kept as it is.'}
              {bulk.kind === 'Section' && 'Type or paste one section on each line, as it is printed: "1. Short title, extent and commencement." Numbers like 7A are understood; a line without a number gets the next one.'}
              {bulk.kind === 'Sub Section' && 'Type one sub section on each line starting with its number: "(1) This Act may be called ...". Each can be refined in the editor afterwards.'}
            </p>
            {bulk.kind === 'Chapter' && (
              <div className="flex flex-wrap items-end gap-2">
                <Input label="Or: how many chapters?" type="number" min={1} max={200} value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className="w-40" />
                <Button variant="outline" size="sm" disabled={!bulkCount || Number(bulkCount) < 1}
                  onClick={() => setBulkText(Array.from({ length: Number(bulkCount) }, (_, i) => `${roman(topParts.filter((n) => n.kind === 'Chapter').length + i + 1)} | Chapter ${topParts.filter((n) => n.kind === 'Chapter').length + i + 1}`).join('\n'))}>Fill the list</Button>
                <span className="pb-2 text-xs text-ink-muted">Then give each chapter its name in the list.</span>
              </div>
            )}
            <Textarea label="One per line" rows={12} value={bulkText} onChange={(e) => setBulkText(e.target.value)} autoFocus />
            {preview.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg bg-surface-muted p-3 text-xs text-ink-soft" aria-label="Preview">
                <p className="mb-1 font-semibold">{preview.length} will be added:</p>
                <ol className="space-y-0.5">{preview.slice(0, 60).map((l, i) => <li key={i}>{[l.number, l.title.slice(0, 90)].filter(Boolean).join('  ')}</li>)}</ol>
                {preview.length > 60 && <p className="mt-1">… and {preview.length - 60} more</p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove this?"
        message={removing ? `"${label(removing)}" and everything under it (${removing.children.length ? `${flatten(removing.children).length} entries` : 'nothing else'}) will be removed.` : ''} confirmLabel="Remove" />
    </div>
  );
}
