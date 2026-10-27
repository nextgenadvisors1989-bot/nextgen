'use client';

/**
 * Add or edit one CAPAR finding row: the Act / Rule it falls under, the minimum requirement, what the auditor found, the
 * non-compliance photo, and the corrective action (root cause, action plan, timeline, evidence). Photos and evidence chosen
 * before the row exists are held in the browser and uploaded as soon as the row is saved.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { LookupPicker, type Option } from '@/components/capar/lookup-picker';
import { AttachmentPicker } from '@/components/capar/capar-attachments';
import type { CaparCategory, CaparFile, CaparFinding } from '@/types/capar';

interface FormState {
  category_id: string;
  outcome: 'Violation' | 'No Violation';
  item_status: 'Incomplete' | 'Not findings' | 'Verified';
  act_rule: string;
  provision: { id: number; label: string } | null;
  act: { id: number; label: string } | null;
  compliance_note: string;
  recommendation: string;
  assessment: string;
  resource: { id: number; label: string } | null;
  minimum_requirement: string;
  local_law: string;
  finding: string;
  root_cause: string;
  action_plan: string;
  timeline_date: string;
  timeline_note: string;
  action_status: 'Open' | 'In Progress' | 'Closed';
}

function initial(finding: CaparFinding | null, categoryId: number | null): FormState {
  return {
    category_id: String(finding?.category_id ?? categoryId ?? ''),
    outcome: finding?.outcome ?? 'Violation',
    item_status: finding?.item_status ?? 'Incomplete',
    act_rule: finding?.act_rule ?? '',
    provision: finding?.provision_id ? { id: finding.provision_id, label: finding.act_rule ?? `Provision #${finding.provision_id}` } : null,
    compliance_note: finding?.compliance_note ?? '',
    recommendation: finding?.recommendation ?? '',
    assessment: finding?.assessment ?? '',
    act: finding?.act_id ? { id: finding.act_id, label: finding.act_short_name ?? `Act #${finding.act_id}` } : null,
    resource: finding?.resource_id ? { id: finding.resource_id, label: finding.resource_title ?? `Document #${finding.resource_id}` } : null,
    minimum_requirement: finding?.minimum_requirement ?? '',
    local_law: finding?.local_law ?? '',
    finding: finding?.finding ?? '',
    root_cause: finding?.root_cause ?? '',
    action_plan: finding?.action_plan ?? '',
    timeline_date: finding?.timeline_date ?? '',
    timeline_note: finding?.timeline_note ?? '',
    action_status: finding?.action_status ?? 'Open',
  };
}

export function FindingModal({ open, onClose, reportId, categories, finding, defaultCategoryId, onSaved }: {
  open: boolean;
  onClose: () => void;
  reportId: number;
  categories: CaparCategory[];
  finding: CaparFinding | null;
  defaultCategoryId: number | null;
  onSaved: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<FormState>(() => initial(finding, defaultCategoryId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<CaparFile[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [evidence, setEvidence] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(initial(finding, defaultCategoryId));
    setExisting(finding?.files ?? []);
    setPhotos([]);
    setEvidence([]);
    setErrors({});
  }, [open, finding, defaultCategoryId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const violation = form.outcome === 'Violation';

  async function removeExisting(file: CaparFile) {
    const result = await api.delete(`/api/capar/${reportId}/files/${file.link_id}`);
    if (result.ok) {
      setExisting((current) => current.filter((item) => item.link_id !== file.link_id));
      onSaved();
    } else {
      errorToast('Could not remove the file', result.message);
    }
  }

  async function upload(findingId: number, files: File[], kind: 'Photo' | 'Evidence') {
    if (!files.length) return true;
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    body.append('kind', kind);
    const result = await apiFetch(`/api/capar/${reportId}/findings/${findingId}/files`, { method: 'POST', body });
    if (!result.ok) errorToast(`Could not upload the ${kind === 'Photo' ? 'photo' : 'evidence'}`, result.message);
    return result.ok;
  }

  async function save() {
    setSaving(true);
    setErrors({});
    const payload = {
      category_id: form.category_id || null,
      outcome: form.item_status === 'Not findings' ? 'No Violation' : form.outcome,
      item_status: form.item_status,
      provision_id: form.provision?.id ?? null,
      compliance_note: form.compliance_note,
      recommendation: form.recommendation,
      assessment: form.assessment,
      act_rule: form.act_rule,
      act_id: form.act?.id ?? null,
      resource_id: form.resource?.id ?? null,
      minimum_requirement: form.minimum_requirement,
      local_law: form.local_law,
      finding: form.finding,
      root_cause: violation ? form.root_cause : null,
      action_plan: violation ? form.action_plan : null,
      timeline_date: violation ? form.timeline_date : null,
      timeline_note: violation ? form.timeline_note : null,
      action_status: form.action_status,
    };
    const result = finding
      ? await api.patch<CaparFinding>(`/api/capar/${reportId}/findings/${finding.id}`, payload)
      : await api.post<CaparFinding>(`/api/capar/${reportId}/findings`, payload);
    if (!result.ok || !result.data) {
      setSaving(false);
      setErrors(fieldErrors(result));
      errorToast('Could not save the finding', result.message);
      return;
    }
    const savedId = result.data.id;
    const photosOk = await upload(savedId, photos, 'Photo');
    const evidenceOk = await upload(savedId, evidence, 'Evidence');
    setSaving(false);
    if (photosOk && evidenceOk) {
      success(finding ? 'Finding saved' : 'Finding added');
      onSaved();
      onClose();
    } else {
      // The row itself is saved; keep the dialog open so the failed upload can be retried.
      onSaved();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={finding ? 'Edit finding' : 'Add finding'}
      description="Record what was found, under which Act or Rule, and the corrective action the facility will take."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{finding ? 'Save finding' : 'Add finding'}</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Category"
            options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
            value={form.category_id}
            onChange={(value) => set('category_id', value)}
            placeholder="Choose the heading it is reported under"
            clearable
            error={errors.category_id}
          />
          <div>
            <span className="label">Result</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Result">
              {(['Violation', 'No Violation'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.outcome === value}
                  onClick={() => set('outcome', value)}
                  className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                    form.outcome === value
                      ? value === 'Violation' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-line bg-white text-ink-soft hover:bg-surface-muted'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <span className="label">Item status</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Item status">
            {([['Incomplete', 'Still being filled in'], ['Not findings', 'Checked, nothing found'], ['Verified', 'Complete, signed off']] as const).map(([value, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.item_status === value}
                onClick={() => setForm((current) => ({ ...current, item_status: value, outcome: value === 'Not findings' ? 'No Violation' : current.outcome }))}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  form.item_status === value
                    ? value === 'Verified' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : value === 'Not findings' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-line bg-white text-ink-soft hover:bg-surface-muted'
                }`}
              >
                <span className="block text-sm font-medium">{value}</span>
                <span className="block text-xs opacity-80">{hint}</span>
              </button>
            ))}
          </div>
          {finding?.signed_by && finding.item_status === 'Verified' && <p className="helper">Signed off by {finding.signed_by}{finding.signed_at ? ` on ${new Date(finding.signed_at).toLocaleString('en-IN')}` : ''}.</p>}
          {errors.item_status && <p className="error-text">{errors.item_status}</p>}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Act, Rule and requirement</h3>
          <LookupPicker
            label="Search the Act library"
            type="provisions"
            selected={form.provision}
            placeholder="Type a section, rule or keyword, e.g. canteen, 38, fire"
            helper="Pick the Chapter, Section or Sub Section. Its path, requirement and amendments fill in below, and you can still edit them."
            onSelect={(option: Option | null) => {
              if (!option) { set('provision', null); return; }
              setForm((current) => ({
                ...current,
                provision: { id: Number(option.value), label: option.label },
                act_rule: option.label.slice(0, 500),
                act: option.actId ? { id: option.actId, label: option.label.split(' > ')[0] } : current.act,
                minimum_requirement: option.text ?? current.minimum_requirement,
                local_law: option.amendments && option.amendments.length ? `Amendments: ${option.amendments.join('; ')}` : current.local_law,
              }));
            }}
          />
          <Input
            label="Act / Rule / Regulation"
            value={form.act_rule}
            onChange={(event) => set('act_rule', event.target.value)}
            placeholder="e.g. Factories Act 1948, Chapter IV, Section 38(1)"
            helper="Filled in when you pick from the Act library; you can also type it by hand."
            error={errors.act_rule}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LookupPicker
              label="Link to an Act in the register (optional)"
              type="acts"
              selected={form.act}
              placeholder="Search the Acts register"
              onSelect={(option) => {
                set('act', option ? { id: Number(option.value), label: option.label } : null);
                if (option && !form.act_rule.trim()) set('act_rule', option.label);
              }}
            />
            <LookupPicker
              label="Act / Rule document (optional)"
              type="resources"
              selected={form.resource}
              placeholder="Search the uploaded documents"
              onSelect={(option) => set('resource', option ? { id: Number(option.value), label: option.label } : null)}
            />
          </div>
          <Textarea
            label="Minimum requirement"
            rows={2}
            value={form.minimum_requirement}
            onChange={(event) => set('minimum_requirement', event.target.value)}
            placeholder="e.g. Appoint a qualified Safety Officer"
            error={errors.minimum_requirement}
          />
          <Textarea
            label="Local law (clause wording)"
            rows={3}
            value={form.local_law}
            onChange={(event) => set('local_law', event.target.value)}
            placeholder="The clause the facility has to meet, as printed in the Act or Rule"
            error={errors.local_law}
          />
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">{violation ? 'Finding' : 'Remarks'}</h3>
          <Textarea
            label={violation ? 'What was found' : 'Remarks (optional)'}
            rows={3}
            required={violation}
            value={form.finding}
            onChange={(event) => set('finding', event.target.value)}
            placeholder={violation ? 'It was noted during the factory tour that ...' : 'Checked and in order'}
            error={errors.finding}
          />
          <AttachmentPicker
            kind="Photo"
            label="Non-compliance photo"
            existing={existing}
            queued={photos}
            onQueue={(files) => setPhotos((current) => [...current, ...files])}
            onUnqueue={(index) => setPhotos((current) => current.filter((_, i) => i !== index))}
            onRemoveExisting={removeExisting}
          />
        </section>

        {violation && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-ink">Corrective action</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Textarea label="Root cause" rows={3} value={form.root_cause} onChange={(event) => set('root_cause', event.target.value)} error={errors.root_cause} />
              <Textarea label="Action plan" rows={3} value={form.action_plan} onChange={(event) => set('action_plan', event.target.value)} error={errors.action_plan} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <DatePicker label="Timeline (complete by)" value={form.timeline_date} onChange={(value) => set('timeline_date', value)} error={errors.timeline_date} />
              <Input label="Timeline note" value={form.timeline_note} onChange={(event) => set('timeline_note', event.target.value)} placeholder="e.g. after the new floor is handed over" />
              <Select
                label="Action status"
                options={['Open', 'In Progress', 'Closed'].map((value) => ({ value, label: value }))}
                value={form.action_status}
                onChange={(value) => set('action_status', value as FormState['action_status'])}
              />
            </div>
            <AttachmentPicker
              kind="Evidence"
              label="Evidence of closure"
              helper="Invoices, certificates, test reports or photos showing the action was completed."
              existing={existing}
              queued={evidence}
              onQueue={(files) => setEvidence((current) => [...current, ...files])}
              onUnqueue={(index) => setEvidence((current) => current.filter((_, i) => i !== index))}
              onRemoveExisting={removeExisting}
            />
            <Textarea label="Compliance" rows={2} value={form.compliance_note} onChange={(event) => set('compliance_note', event.target.value)} error={errors.compliance_note}
              helper="What the facility has done to comply, once the action is carried out." />
          </section>
        )}

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Recommendation and assessment</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Textarea label="Recommendations" rows={3} value={form.recommendation} onChange={(event) => set('recommendation', event.target.value)} error={errors.recommendation} />
            <Textarea label="Verification / Assessment" rows={3} value={form.assessment} onChange={(event) => set('assessment', event.target.value)} error={errors.assessment}
              helper="Your own check that the action fixes the finding." />
          </div>
        </section>
      </div>
    </Modal>
  );
}
