'use client';

/**
 * Administrator's setup of the document pack: the checklist itself (sections and the documents under them) and which sections each auditor receives.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface TemplateItem { id: number; section_id: number; group_name: string | null; name: string; status: 'active' | 'inactive' }
interface TemplateSection { id: number; name: string; description: string | null; status: 'active' | 'inactive'; item_count: number; items: TemplateItem[] }
interface AuditorRow { id: number; name: string; email: string | null; type_name: string | null; sections: number }
interface AccessRow { id: number; name: string; item_count: number; granted: boolean }

export function EvidenceAdmin() {
  return (
    <Card padded={false}>
      <Tabs defaultTab="checklist" items={[
        { key: 'checklist', label: 'Checklist', content: <TemplateEditor /> },
        { key: 'access', label: 'Auditor access', content: <AccessEditor /> },
      ]} />
    </Card>
  );
}

function TemplateEditor() {
  const toast = useToast();
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [sectionForm, setSectionForm] = useState<{ id: number | null; name: string; description: string; status: string } | null>(null);
  const [itemForm, setItemForm] = useState<{ id: number | null; section_id: number; group_name: string; name: string; status: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ kind: 'sections' | 'items'; id: number; label: string } | null>(null);

  const load = useCallback(async () => {
    const response = await api.get<TemplateSection[]>('/api/evidence/template');
    if (response.ok && Array.isArray(response.data)) setSections(response.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveSection() {
    if (!sectionForm) return;
    setBusy(true); setErrors({});
    const body = { name: sectionForm.name, description: sectionForm.description, status: sectionForm.status };
    const response = sectionForm.id ? await api.put(`/api/evidence/template/sections/${sectionForm.id}`, body) : await api.post('/api/evidence/template/sections', body);
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    toast.success(response.message); setSectionForm(null); load();
  }

  async function saveItem() {
    if (!itemForm) return;
    setBusy(true); setErrors({});
    const body = { section_id: itemForm.section_id, group_name: itemForm.group_name, name: itemForm.name, status: itemForm.status };
    const response = itemForm.id ? await api.put(`/api/evidence/template/items/${itemForm.id}`, body) : await api.post('/api/evidence/template/items', body);
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    toast.success(response.message); setItemForm(null); load();
  }

  async function remove() {
    if (!removing) return;
    const response = await api.delete(`/api/evidence/template/${removing.kind}/${removing.id}`);
    setRemoving(null);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success(response.message); load();
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">The documents an employer lists before an audit. Sections can be given to auditors separately. Changes show to every employer the next time they open the list.</p>
        <Button size="sm" onClick={() => { setErrors({}); setSectionForm({ id: null, name: '', description: '', status: 'active' }); }}>Add section</Button>
      </div>
      {loading ? <p className="mt-6 text-sm text-ink-muted">Loading...</p> : (
        <div className="mt-4 space-y-3">
          {sections.map((section) => {
            const isOpen = open[section.id] ?? false;
            return (
              <div key={section.id} className="rounded-lg border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen((c) => ({ ...c, [section.id]: !isOpen }))}>
                    <span className="text-xs text-ink-muted">{isOpen ? '▾' : '▸'}</span>
                    <span className="truncate text-sm font-semibold text-ink">{section.name}</span>
                    <Badge tone="default">{section.item_count}</Badge>
                    {section.status === 'inactive' && <Badge tone="danger">inactive</Badge>}
                  </button>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setItemForm({ id: null, section_id: section.id, group_name: '', name: '', status: 'active' }); }}>Add document</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setSectionForm({ id: section.id, name: section.name, description: section.description ?? '', status: section.status }); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving({ kind: 'sections', id: section.id, label: section.name })}>Delete</Button>
                  </div>
                </div>
                {isOpen && (
                  <ul className="divide-y divide-line border-t border-line">
                    {section.items.length === 0 && <li className="px-4 py-3 text-sm text-ink-muted">No documents in this section.</li>}
                    {section.items.map((item, index) => (
                      <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2 text-sm">
                        <span className="min-w-0 flex-1"><span className="mr-2 text-xs tabular-nums text-ink-muted">{index + 1}.</span>{item.name}
                          {item.group_name && <span className="ml-2 text-xs text-ink-muted">({item.group_name})</span>}
                          {item.status === 'inactive' && <Badge tone="danger" className="ml-2">inactive</Badge>}</span>
                        <span className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => { setErrors({}); setItemForm({ id: item.id, section_id: item.section_id, group_name: item.group_name ?? '', name: item.name, status: item.status }); }}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving({ kind: 'items', id: item.id, label: item.name })}>Delete</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(sectionForm)} onClose={() => setSectionForm(null)} title={sectionForm?.id ? 'Edit section' : 'Add section'}
        footer={<><Button variant="ghost" onClick={() => setSectionForm(null)}>Cancel</Button><Button onClick={saveSection} loading={busy}>Save</Button></>}>
        {sectionForm && (
          <div className="space-y-3">
            <Input label="Section name" requiredMark value={sectionForm.name} onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })} error={errors.name} />
            <Input label="Description" value={sectionForm.description} onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })} error={errors.description} />
            <Select label="Status" value={sectionForm.status} onChange={(v) => setSectionForm({ ...sectionForm, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (hidden)' }]} />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(itemForm)} onClose={() => setItemForm(null)} title={itemForm?.id ? 'Edit document' : 'Add document'}
        footer={<><Button variant="ghost" onClick={() => setItemForm(null)}>Cancel</Button><Button onClick={saveItem} loading={busy}>Save</Button></>}>
        {itemForm && (
          <div className="space-y-3">
            <Select label="Section" value={String(itemForm.section_id)} onChange={(v) => setItemForm({ ...itemForm, section_id: Number(v) })} options={sections.map((s) => ({ value: String(s.id), label: s.name }))} error={errors.section_id} />
            <Input label="Document" requiredMark value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} error={errors.name} />
            <Input label="Group (optional)" value={itemForm.group_name} onChange={(e) => setItemForm({ ...itemForm, group_name: e.target.value })} error={errors.group_name} helper="A sub heading inside the section, e.g. Licences and certificates" />
            <Select label="Status" value={itemForm.status} onChange={(v) => setItemForm({ ...itemForm, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (hidden)' }]} />
          </div>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Delete this entry?"
        message={removing ? `"${removing.label}"${removing.kind === 'sections' ? ' and every document in it' : ''} is removed from the checklist. Employers' earlier submissions are not changed.` : ''} confirmLabel="Delete" />
    </div>
  );
}

function AccessEditor() {
  const toast = useToast();
  const [auditors, setAuditors] = useState<AuditorRow[]>([]);
  const [auditorId, setAuditorId] = useState('');
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAuditors = useCallback(async () => {
    const response = await api.get<AuditorRow[]>('/api/evidence/access');
    if (response.ok && Array.isArray(response.data)) setAuditors(response.data);
  }, []);
  useEffect(() => { loadAuditors(); }, [loadAuditors]);

  useEffect(() => {
    if (!auditorId) { setRows([]); return; }
    api.get<AccessRow[]>(`/api/evidence/access/${auditorId}`).then((response) => {
      if (response.ok && Array.isArray(response.data)) {
        setRows(response.data);
        const ids = response.data.filter((r) => r.granted).map((r) => r.id);
        setPicked(ids); setSaved(ids);
      }
    });
  }, [auditorId]);

  const toggle = (id: number) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const dirty = picked.length !== saved.length || picked.some((id) => !saved.includes(id));

  async function save() {
    setBusy(true);
    const response = await api.put(`/api/evidence/access/${auditorId}`, { section_ids: picked });
    setBusy(false);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success('Access saved'); setSaved(picked); loadAuditors();
  }

  return (
    <div className="p-5">
      <p className="max-w-2xl text-sm text-ink-muted">Choose which document sections each auditor receives. An auditor with no sections sees none of the employer&apos;s documents. An auditor with sections must download the employer&apos;s submitted pack before starting a CAPAR.</p>
      <div className="mt-4 max-w-md">
        <Select label="Auditor" searchable value={auditorId} onChange={setAuditorId} placeholder="Choose an auditor"
          options={auditors.map((a) => ({ value: String(a.id), label: `${a.name}${a.type_name ? ` - ${a.type_name}` : ''} (${a.sections} section${a.sections === 1 ? '' : 's'})` }))} />
      </div>
      {auditorId && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPicked(rows.map((r) => r.id))}>Select all</Button>
            <Button size="sm" variant="outline" onClick={() => setPicked([])}>Clear</Button>
            <span className="text-xs text-ink-muted">{picked.length} of {rows.length} selected</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-muted">
                  <input type="checkbox" checked={picked.includes(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 text-sm text-ink">{row.name}</span>
                  <span className="text-xs text-ink-muted">{row.item_count}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4"><Button onClick={save} loading={busy} disabled={!dirty}>Save access</Button></div>
        </div>
      )}
    </div>
  );
}
