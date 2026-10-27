'use client';

/**
 * The Act's Chapters, Sections and Sub Sections, each with an Explain text and its Amendments (the client's Act library structure).
 * Administrators add, edit and remove them; auditors later search them when they record a CAPAR finding.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface Amendment { id?: number; amended_on: string | null; reference: string | null; description: string }
interface Node {
  id: number; parent_id: number | null; kind: 'Chapter' | 'Section' | 'Sub Section'; number: string | null; title: string; explanation: string | null;
  status: 'active' | 'repealed' | 'omitted'; amendments: Amendment[]; children: Node[];
}
interface Payload { act: { id: number; act_name: string }; tree: Node[]; total: number }

const CHILD_KIND: Record<string, 'Section' | 'Sub Section' | null> = { Chapter: 'Section', Section: 'Sub Section', 'Sub Section': null };

interface FormState { kind: string; parent_id: string; number: string; title: string; explanation: string; status: string; amendments: { amended_on: string; reference: string; description: string }[] }
const blank = (kind = 'Chapter', parent = ''): FormState => ({ kind, parent_id: parent, number: '', title: '', explanation: '', status: 'active', amendments: [] });

function flatten(nodes: Node[], depth = 0, out: { node: Node; depth: number }[] = []) {
  for (const node of nodes) { out.push({ node, depth }); flatten(node.children, depth + 1, out); }
  return out;
}

export function ActProvisions({ actId, canEdit }: { actId: number; canEdit: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Node | null>(null);

  const load = useCallback(async () => {
    const response = await api.get<Payload>(`/api/admin/compliance/acts/${actId}/provisions`);
    if (response.ok && response.data) setData(response.data);
    setLoading(false);
  }, [actId]);
  useEffect(() => { load(); }, [load]);

  function startAdd(kind: string, parent: Node | null) { setErrors({}); setEditing({ id: null, form: blank(kind, parent ? String(parent.id) : '') }); }
  function startEdit(node: Node) {
    setErrors({});
    setEditing({ id: node.id, form: { kind: node.kind, parent_id: node.parent_id ? String(node.parent_id) : '', number: node.number ?? '', title: node.title, explanation: node.explanation ?? '', status: node.status,
      amendments: node.amendments.map((a) => ({ amended_on: a.amended_on ?? '', reference: a.reference ?? '', description: a.description })) } });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setErrors({});
    const body = { ...editing.form, parent_id: editing.form.parent_id || null };
    const response = editing.id
      ? await api.put(`/api/admin/compliance/acts/${actId}/provisions/${editing.id}`, body)
      : await api.post(`/api/admin/compliance/acts/${actId}/provisions`, body);
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    toast.success(response.message);
    setEditing(null);
    load();
  }

  async function remove() {
    if (!removing) return;
    const response = await api.delete(`/api/admin/compliance/acts/${actId}/provisions/${removing.id}`);
    setRemoving(null);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success('Removed');
    load();
  }

  const rows = data ? flatten(data.tree) : [];
  const flat = rows.map((r) => r.node);
  const form = editing?.form;
  const parentChoices = form
    ? flat.filter((n) => (form.kind === 'Section' ? n.kind === 'Chapter' : form.kind === 'Sub Section' ? n.kind === 'Section' : false) && n.id !== editing?.id)
    : [];
  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setEditing((current) => current && { ...current, form: { ...current.form, [key]: event.target.value } });
  const setAmendment = (index: number, key: 'amended_on' | 'reference' | 'description', value: string) =>
    setEditing((current) => current && { ...current, form: { ...current.form, amendments: current.form.amendments.map((a, i) => (i === index ? { ...a, [key]: value } : a)) } });

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">Chapter, Section and Sub Section, each with its explanation and amendments. Auditors search this list to pick the requirement a finding falls under.</p>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => startAdd('Section', null)}>Add section</Button>
            <Button size="sm" onClick={() => startAdd('Chapter', null)}>Add chapter</Button>
          </div>
        )}
      </div>

      {loading ? <p className="mt-6 text-sm text-ink-muted">Loading...</p> : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="font-medium text-ink">No chapters or sections yet</p>
          <p className="mt-1 text-sm text-ink-muted">Add the chapters of this Act, then the sections and sub sections beneath them.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {rows.map(({ node, depth }) => {
            const expanded = Boolean(open[node.id]);
            const child = CHILD_KIND[node.kind];
            return (
              <li key={node.id} className="px-3 py-2.5" style={{ paddingLeft: `${12 + depth * 22}px` }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setOpen((c) => ({ ...c, [node.id]: !expanded }))} aria-expanded={expanded}>
                    <span className="mt-0.5 text-xs text-ink-muted">{expanded ? '▾' : '▸'}</span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={node.kind === 'Chapter' ? 'info' : node.kind === 'Section' ? 'default' : 'warning'}>{node.kind}</Badge>
                        <span className="text-sm font-semibold text-ink">{[node.number, node.title].filter(Boolean).join(' - ')}</span>
                        {node.status !== 'active' && <Badge tone="danger">{node.status}</Badge>}
                        {node.amendments.length > 0 && <span className="text-xs text-ink-muted">{node.amendments.length} amendment{node.amendments.length === 1 ? '' : 's'}</span>}
                      </span>
                    </span>
                  </button>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1.5">
                      {child && <Button size="sm" variant="ghost" onClick={() => startAdd(child, node)}>Add {child.toLowerCase()}</Button>}
                      <Button size="sm" variant="ghost" onClick={() => startEdit(node)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(node)}>Delete</Button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="ml-5 mt-2 space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Explain</p>
                      <p className="mt-1 whitespace-pre-line text-ink-soft">{node.explanation || 'No explanation recorded.'}</p>
                    </div>
                    {node.amendments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Amendments</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
                          {node.amendments.map((a, i) => <li key={a.id ?? i}>{[a.amended_on, a.reference].filter(Boolean).join(' · ')}{a.amended_on || a.reference ? ': ' : ''}{a.description}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="lg" title={editing?.id ? 'Edit' : `Add ${form?.kind.toLowerCase() ?? ''}`}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Select label="Level" value={form.kind} onChange={(v) => setEditing((c) => c && { ...c, form: { ...c.form, kind: v, parent_id: '' } })}
                options={['Chapter', 'Section', 'Sub Section'].map((k) => ({ value: k, label: k }))} error={errors.kind} />
              <Input label="Number" value={form.number} onChange={set('number')} error={errors.number} placeholder={form.kind === 'Chapter' ? 'e.g. IV' : form.kind === 'Section' ? 'e.g. 21' : 'e.g. (1)'} />
              <Select label="Status" value={form.status} onChange={(v) => setEditing((c) => c && { ...c, form: { ...c.form, status: v } })}
                options={[{ value: 'active', label: 'In force' }, { value: 'repealed', label: 'Repealed' }, { value: 'omitted', label: 'Omitted' }]} />
            </div>
            {form.kind !== 'Chapter' && (
              <Select label={form.kind === 'Section' ? 'Under chapter' : 'Under section'} value={form.parent_id} onChange={(v) => setEditing((c) => c && { ...c, form: { ...c.form, parent_id: v } })}
                clearable={form.kind === 'Section'} searchable placeholder={form.kind === 'Section' ? 'Directly under the Act' : 'Choose the section'} error={errors.parent_id}
                options={parentChoices.map((n) => ({ value: String(n.id), label: [n.kind, n.number, n.title].filter(Boolean).join(' ') }))} />
            )}
            <Input label="Title / heading" requiredMark value={form.title} onChange={set('title')} error={errors.title} />
            <Textarea label="Explain" rows={6} value={form.explanation} onChange={set('explanation')} error={errors.explanation}
              helper="What it requires, in plain words. This is the text an auditor picks as the minimum requirement." />
            <div>
              <div className="flex items-center justify-between">
                <p className="label">Amendments</p>
                <Button size="sm" variant="outline" onClick={() => setEditing((c) => c && { ...c, form: { ...c.form, amendments: [...c.form.amendments, { amended_on: '', reference: '', description: '' }] } })}>Add amendment</Button>
              </div>
              {form.amendments.length === 0 && <p className="mt-1 text-xs text-ink-muted">None recorded.</p>}
              <div className="mt-2 space-y-2">
                {form.amendments.map((a, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-line p-2 md:grid-cols-[150px_1fr_auto]">
                    <Input label="Date" type="date" value={a.amended_on} onChange={(e) => setAmendment(i, 'amended_on', e.target.value)} />
                    <Input label="Reference" value={a.reference} onChange={(e) => setAmendment(i, 'reference', e.target.value)} placeholder="e.g. Act 12 of 2020" />
                    <div className="flex items-end"><Button size="sm" variant="ghost" onClick={() => setEditing((c) => c && { ...c, form: { ...c.form, amendments: c.form.amendments.filter((_, j) => j !== i) } })}>Remove</Button></div>
                    <div className="md:col-span-3"><Textarea label="What changed" rows={2} value={a.description} onChange={(e) => setAmendment(i, 'description', e.target.value)} error={errors[`amendments.${i}.description`]} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove this provision?"
        message={removing ? `"${[removing.kind, removing.number].filter(Boolean).join(' ')}" and everything under it is removed.` : ''} confirmLabel="Remove" />
    </div>
  );
}
