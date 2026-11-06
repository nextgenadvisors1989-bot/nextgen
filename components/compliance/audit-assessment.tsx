'use client';

/**
 * Audit and Assessment: the audits and assessments the firm offers. Each one opens the dynamic forms an administrator has linked to it
 * (one or several); until then a click says "coming soon". Every linked form can also be downloaded empty as a PDF or a Word file, to fill in on site.
 * An administrator can add or remove an entry and choose the forms it opens.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { AuditPicker } from '@/components/compliance/audit-picker';

interface LinkedForm { id: number; name: string; canOpen: boolean }
interface AuditType { id: number; name: string; status: string; forms: LinkedForm[]; formId: number | null; formName: string | null; canOpen: boolean }
interface LinkableForm { id: number; name: string; moduleName: string | null }

const downloads = (formId: number) => (
  <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-brand-600">
    <a href={`/api/documents/form/${formId}?format=pdf`} className="hover:underline" title="Download the empty form as a PDF">PDF</a>
    <a href={`/api/documents/form/${formId}?format=docx`} className="hover:underline" title="Download the empty form as a Word file">Word</a>
  </span>
);

export function AuditAssessment({ mode }: { mode: 'admin' | 'auditor' }) {
  if (mode === 'auditor') return <AuditPicker />;
  return <AuditAssessmentAdmin />;
}

function AuditAssessmentAdmin() {
  const admin = true;
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [types, setTypes] = useState<AuditType[] | null>(null);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<AuditType | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<AuditType | null>(null);
  const [forms, setForms] = useState<LinkableForm[]>([]);
  const [formChoice, setFormChoice] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<AuditType[]>('/api/compliance-register/types');
    if (result.ok && Array.isArray(result.data)) setTypes(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!admin) return;
    void api.get<LinkableForm[]>('/api/compliance-register/forms').then((result) => { if (result.ok && Array.isArray(result.data)) setForms(result.data); });
  }, [admin]);

  function openType(type: AuditType) {
    // An auditor with exactly one form to open goes straight to it; with several, the popup lists them. An administrator manages the links.
    const openable = type.forms.filter((form) => form.canOpen);
    if (!admin && openable.length === 1) { router.push(`/auditor/forms/${openable[0].id}`); return; }
    setFormChoice(type.forms.map((form) => String(form.id)));
    setOpened(type);
  }

  async function saveLink() {
    if (!opened) return;
    setSaving(true);
    const result = await api.put(`/api/compliance-register/types/${opened.id}`, { name: opened.name, form_ids: formChoice.map(Number) });
    setSaving(false);
    if (!result.ok) { errorToast('Could not save the links', result.message); return; }
    success(formChoice.length ? 'Forms linked' : 'Forms unlinked');
    setOpened(null);
    await load();
  }

  async function add() {
    const result = await api.post('/api/compliance-register/types', { name });
    if (!result.ok) { errorToast('Could not add it', result.message); return; }
    success('Added');
    setAdding(false); setName('');
    await load();
  }

  async function remove() {
    if (!removing) return;
    const result = await api.delete(`/api/compliance-register/types/${removing.id}`);
    setRemoving(null);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Removed');
    await load();
  }

  const needle = search.trim().toLowerCase();
  const shown = (types ?? []).filter((type) => !needle || type.name.toLowerCase().includes(needle));
  const caption = (type: AuditType) => {
    if (type.forms.length === 0) return 'Coming soon';
    if (admin) return type.forms.length === 1 ? `Form: ${type.forms[0].name}` : `${type.forms.length} forms`;
    const openable = type.forms.filter((form) => form.canOpen).length;
    if (openable === 0) return 'Not assigned to you yet';
    return openable === 1 ? 'Open the form' : `${openable} forms`;
  };
  const caption2Tone = (type: AuditType) => (type.forms.length > 0 && (admin || type.canOpen) ? 'text-emerald-700' : 'text-ink-muted');
  const visibleForms = (type: AuditType) => type.forms.filter((form) => admin || form.canOpen);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-96"><Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. fire, HAZOP, labour" /></div>
            {admin && <Button size="sm" onClick={() => setAdding(true)}>+ Add audit or assessment</Button>}
          </div>
        </CardBody>
      </Card>

      {types === null ? <p className="py-8 text-center text-sm text-ink-muted">Loading...</p> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((type) => (
            <li key={type.id} className={`flex items-stretch overflow-hidden rounded-xl border border-line bg-white ${type.status === 'inactive' ? 'opacity-60' : ''}`}>
              <button type="button" onClick={() => openType(type)} className="flex-1 px-4 py-3.5 text-left text-sm font-medium text-ink hover:bg-surface-muted">
                {type.name}
                <span className={`mt-1 block text-xs font-normal ${caption2Tone(type)}`}>{caption(type)}</span>
              </button>
              {visibleForms(type).length === 1 && (
                <span className="flex flex-col items-center justify-center gap-1 border-l border-line px-3 text-xs font-semibold text-brand-600">
                  <a href={`/api/documents/form/${visibleForms(type)[0].id}?format=pdf`} className="hover:underline" title="Download the empty form as a PDF">PDF</a>
                  <a href={`/api/documents/form/${visibleForms(type)[0].id}?format=docx`} className="hover:underline" title="Download the empty form as a Word file">Word</a>
                </span>
              )}
              {admin && <button type="button" onClick={() => setRemoving(type)} aria-label={`Remove ${type.name}`} className="px-3 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>}
            </li>
          ))}
          {shown.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted md:col-span-2">Nothing matches.</li>}
        </ul>
      )}

      <Modal
        open={Boolean(opened)}
        onClose={() => setOpened(null)}
        title={opened?.name ?? ''}
        size="lg"
        footer={admin ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpened(null)}>Cancel</Button>
            <Button onClick={saveLink} loading={saving}>Save</Button>
          </div>
        ) : <div className="flex justify-end"><Button onClick={() => setOpened(null)}>{opened && visibleForms(opened).length > 0 ? 'Close' : 'OK'}</Button></div>}
      >
        {opened && opened.forms.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold text-ink">{admin ? 'Forms linked to this entry' : 'Choose the form to fill in'}</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {visibleForms(opened).map((form) => (
                <li key={form.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{form.name}</span>
                  {downloads(form.id)}
                  {form.canOpen && <Button size="sm" onClick={() => router.push(`/auditor/forms/${form.id}`)}>Open</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {admin ? (
          <div className="space-y-3">
            <MultiSelect
              label="Forms this audit opens"
              options={forms.map((form) => ({ value: String(form.id), label: form.moduleName && form.moduleName !== form.name ? `${form.name} (${form.moduleName})` : form.name }))}
              values={formChoice}
              onChange={setFormChoice}
              helper="Pick any published forms; leave it empty to show Coming soon. To make a new one, build it under Dynamic Modules, publish it, then link it here."
            />
          </div>
        ) : opened && visibleForms(opened).length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-lg font-semibold text-ink">{opened.forms.length > 0 ? 'Not assigned to you yet' : 'Coming soon'}</p>
            <p className="mt-2 text-sm text-ink-muted">{opened.forms.length > 0 ? 'These forms are not part of your auditor type. Ask the administrator to assign them to you.' : 'The form for this audit is being prepared and will be available here soon.'}</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an audit or assessment"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={add} disabled={name.trim().length < 3}>Add</Button></div>}
      >
        <Input label="Audit or assessment" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Noise and Vibration Survey" />
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this audit or assessment?"
        message={removing ? `"${removing.name}" is removed from the list.` : ''}
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  );
}
