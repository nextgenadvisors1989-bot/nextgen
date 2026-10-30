'use client';

/**
 * The form for one CAPAR row, in plain steps anybody can follow:
 *   1. Is there an issue?     "No issue found" or "Issue found"
 *   2. (issue) Which rule?     search the Act library, or type it
 *   3. What did you find?      statement and a photo
 *   4. Why did it happen?      root cause
 *   5. What will be done?      action plan, the date, and later the proof
 *   6. Recommendation and the auditor's own assessment
 * "No issue found" needs nothing else. An issue is saved as a draft or signed off (Verified) in the auditor's name.
 * It sits in a popup for a checklist document and for a row typed in under a category.
 * Photos and proof chosen before the row exists are held in the browser and uploaded as soon as the row is saved.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { LookupPicker, type Option } from '@/components/capar/lookup-picker';
import { AttachmentPicker } from '@/components/capar/capar-attachments';
import type { CaparCategory, CaparFile, CaparFinding } from '@/types/capar';

const LOCATIONS = ['Production floor', 'Boiler house', 'ETP / effluent area', 'Canteen', 'Store / warehouse', 'Dormitory', 'Fire pump room', 'DG / electrical room', 'Main gate / security', 'HR / admin office', 'Whole factory'];

interface FormState {
  category_id: string;
  location: string;
  result: 'ok' | 'issue' | null;
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

export interface EditorItem { id: number; name: string; sectionName: string }

function initial(finding: CaparFinding | null, categoryId: number | null): FormState {
  return {
    category_id: String(finding?.category_id ?? categoryId ?? ''),
    location: finding?.location ?? '',
    result: !finding ? null : finding.item_status === 'Not findings' || finding.outcome === 'No Violation' ? 'ok' : 'issue',
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

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700" aria-hidden>{n}</span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {hint && <p className="text-xs text-ink-muted">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function FindingEditor({ reportId, categories, finding, item, defaultCategoryId, onSaved, onClose, onRemove }: {
  reportId: number;
  categories: CaparCategory[];
  finding: CaparFinding | null;
  /** Set when the row belongs to a checklist document; the row is then tied to it and has no free category. */
  item?: EditorItem | null;
  defaultCategoryId?: number | null;
  onSaved: () => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<FormState>(() => initial(finding, defaultCategoryId ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'draft' | 'final' | null>(null);
  const [existing, setExisting] = useState<CaparFile[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [evidence, setEvidence] = useState<File[]>([]);

  useEffect(() => {
    setForm(initial(finding, defaultCategoryId ?? null));
    setExisting(finding?.files ?? []);
    setPhotos([]);
    setEvidence([]);
    setErrors({});
  }, [finding, defaultCategoryId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const issue = form.result === 'issue';

  async function removeExisting(file: CaparFile) {
    const result = await api.delete(`/api/capar/${reportId}/files/${file.link_id}`);
    if (result.ok) {
      setExisting((current) => current.filter((entry) => entry.link_id !== file.link_id));
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
    if (!result.ok) errorToast(`Could not upload the ${kind === 'Photo' ? 'photo' : 'proof'}`, result.message);
    return result.ok;
  }

  /** `final` signs an issue off (Verified); a draft stays Incomplete. "No issue found" is always saved as Not findings. */
  async function save(mode: 'draft' | 'final') {
    if (!form.result) return;
    setSaving(mode);
    setErrors({});
    const itemStatus = form.result === 'ok' ? 'Not findings' : mode === 'final' ? 'Verified' : 'Incomplete';
    const payload = {
      category_id: item ? null : form.category_id || null,
      location: form.location.trim() || null,
      evidence_item_id: item ? item.id : finding?.evidence_item_id ?? null,
      outcome: issue ? 'Violation' : 'No Violation',
      item_status: itemStatus,
      provision_id: issue ? form.provision?.id ?? null : null,
      compliance_note: issue ? form.compliance_note : null,
      recommendation: form.recommendation,
      assessment: form.assessment,
      act_rule: issue ? form.act_rule : null,
      act_id: issue ? form.act?.id ?? null : null,
      resource_id: issue ? form.resource?.id ?? null : null,
      minimum_requirement: issue ? form.minimum_requirement : null,
      local_law: issue ? form.local_law : null,
      finding: form.finding,
      root_cause: issue ? form.root_cause : null,
      action_plan: issue ? form.action_plan : null,
      timeline_date: issue ? form.timeline_date : null,
      timeline_note: issue ? form.timeline_note : null,
      action_status: form.action_status,
    };
    const result = finding
      ? await api.patch<CaparFinding>(`/api/capar/${reportId}/findings/${finding.id}`, payload)
      : await api.post<CaparFinding>(`/api/capar/${reportId}/findings`, payload);
    if (!result.ok || !result.data) {
      setSaving(null);
      setErrors(fieldErrors(result));
      errorToast(mode === 'final' && issue ? 'Please complete the highlighted answers' : 'Could not save', result.message);
      return;
    }
    const savedId = result.data.id;
    const photosOk = await upload(savedId, photos, 'Photo');
    const evidenceOk = await upload(savedId, evidence, 'Evidence');
    setSaving(null);
    onSaved();
    if (photosOk && evidenceOk) {
      success(form.result === 'ok' ? 'Saved: no issue' : mode === 'final' ? 'Saved and signed off' : 'Saved as draft', item?.name);
      onClose();
    }
    // A failed upload keeps the popup open so it can be retried; the row itself is already saved.
  }

  return (
    <div className="space-y-6">
      {!item && (
        <Select
          label="Category"
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          value={form.category_id}
          onChange={(value) => set('category_id', value)}
          placeholder="Choose the heading it is reported under"
          clearable
          error={errors.category_id}
        />
      )}

      <Step n={1} title="Non-compliance status" hint="Is this document in order?">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Result">
          <button
            type="button"
            role="radio"
            aria-checked={form.result === 'ok'}
            onClick={() => set('result', 'ok')}
            className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${form.result === 'ok' ? 'border-emerald-500 bg-emerald-50' : 'border-line bg-white hover:bg-surface-muted'}`}
          >
            <span className="block text-sm font-semibold text-emerald-800">No issue found</span>
            <span className="block text-xs text-ink-soft">Checked and in order</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={form.result === 'issue'}
            onClick={() => set('result', 'issue')}
            className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${form.result === 'issue' ? 'border-red-500 bg-red-50' : 'border-line bg-white hover:bg-surface-muted'}`}
          >
            <span className="block text-sm font-semibold text-red-800">Issue found</span>
            <span className="block text-xs text-ink-soft">Not compliant, or something is missing</span>
          </button>
        </div>
        {finding?.signed_by && finding.item_status === 'Verified' && (
          <p className="helper">Signed off by {finding.signed_by}{finding.signed_at ? ` on ${new Date(finding.signed_at).toLocaleString('en-IN')}` : ''}.</p>
        )}
      </Step>

      {form.result === 'ok' && (
        <Step n={2} title="Anything to note?" hint="Optional.">
          <Textarea label="Remarks" rows={3} value={form.finding} onChange={(event) => set('finding', event.target.value)} placeholder="e.g. Register checked for the last 6 months and is up to date" error={errors.finding} />
        </Step>
      )}

      {issue && (
        <>
          <Step n={2} title="Minimum requirements" hint="Act, Rules, Regulation, Notification: search the library, or type it yourself.">
            <LookupPicker
              label="Search (Act, Rules, Regulation, Notification)"
              type="provisions"
              selected={form.provision}
              placeholder="Type a word, e.g. leave, canteen, fire, 38"
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
            <Input label="Act / Rule" value={form.act_rule} onChange={(event) => set('act_rule', event.target.value)} placeholder="e.g. Factories Act 1948, Section 38(1)" error={errors.act_rule} />
            <Textarea label="What the rule requires" rows={2} value={form.minimum_requirement} onChange={(event) => set('minimum_requirement', event.target.value)} placeholder="e.g. A leave register must be kept for every worker" error={errors.minimum_requirement} />
          </Step>

          <Step n={3} title="Statement and image">
            <Textarea label="Statement / Findings" required rows={3} value={form.finding} onChange={(event) => set('finding', event.target.value)} placeholder="It was noted during the document review that ..." error={errors.finding} />
            <div>
              <span className="label">Location inside the factory</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  aria-label="Location inside the factory"
                  value={LOCATIONS.includes(form.location) ? form.location : form.location ? 'Others' : ''}
                  onChange={(event) => set('location', event.target.value === 'Others' ? ' ' : event.target.value)}
                  className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
                >
                  <option value="">Choose where it was seen</option>
                  {LOCATIONS.map((place) => <option key={place} value={place}>{place}</option>)}
                  <option value="Others">Others (write it)</option>
                </select>
                {form.location !== '' && !LOCATIONS.includes(form.location) && (
                  <input
                    aria-label="Other location"
                    value={form.location.trim() === '' ? '' : form.location}
                    onChange={(event) => set('location', event.target.value === '' ? ' ' : event.target.value)}
                    placeholder="Write the location"
                    maxLength={255}
                    className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400"
                  />
                )}
              </div>
            </div>
            <AttachmentPicker
              kind="Photo"
              label="Image upload (photo of the issue)"
              existing={existing}
              queued={photos}
              onQueue={(files) => setPhotos((current) => [...current, ...files])}
              onUnqueue={(index) => setPhotos((current) => current.filter((_, i) => i !== index))}
              onRemoveExisting={removeExisting}
            />
          </Step>

          <Step n={4} title="Root cause">
            <Textarea label="Root cause" rows={2} value={form.root_cause} onChange={(event) => set('root_cause', event.target.value)} error={errors.root_cause} />
          </Step>

          <Step n={5} title="Action plan, timeline and proof">
            <Textarea label="Action plan" rows={2} value={form.action_plan} onChange={(event) => set('action_plan', event.target.value)} error={errors.action_plan} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DatePicker label="Timeline (complete by)" value={form.timeline_date} onChange={(value) => set('timeline_date', value)} error={errors.timeline_date} />
              <Select
                label="Progress"
                options={[{ value: 'Open', label: 'Not started' }, { value: 'In Progress', label: 'In progress' }, { value: 'Closed', label: 'Done' }]}
                value={form.action_status}
                onChange={(value) => set('action_status', value as FormState['action_status'])}
              />
            </div>
            <AttachmentPicker
              kind="Evidence"
              label="Compliance image upload (proof it was fixed, optional)"
              helper="A photo, certificate, invoice or report. You can add it later."
              existing={existing}
              queued={evidence}
              onQueue={(files) => setEvidence((current) => [...current, ...files])}
              onUnqueue={(index) => setEvidence((current) => current.filter((_, i) => i !== index))}
              onRemoveExisting={removeExisting}
            />
          </Step>

          <Step n={6} title="Recommendations and verification" hint="Saving with Save & sign off puts your name and the time as the signature.">
            <Textarea label="Recommendations" rows={2} value={form.recommendation} onChange={(event) => set('recommendation', event.target.value)} error={errors.recommendation} />
            <Textarea label="Verification / Assessment" rows={2} value={form.assessment} onChange={(event) => set('assessment', event.target.value)} error={errors.assessment}
              helper="Your own check that the action fixes the issue." />
          </Step>

          <details className="group rounded-xl border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-soft marker:content-none">
              More options <span className="ml-1 text-brand-600 group-open:hidden">show</span><span className="ml-1 hidden text-brand-600 group-open:inline">hide</span>
            </summary>
            <div className="mt-3 space-y-4">
              <Textarea label="Local law (clause wording)" rows={3} value={form.local_law} onChange={(event) => set('local_law', event.target.value)} error={errors.local_law} />
              <Input label="Note on the date" value={form.timeline_note} onChange={(event) => set('timeline_note', event.target.value)} placeholder="e.g. after the new floor is handed over" />
              <Textarea label="How the facility complied" rows={2} value={form.compliance_note} onChange={(event) => set('compliance_note', event.target.value)} error={errors.compliance_note} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <LookupPicker label="Link to an Act in the register" type="acts" selected={form.act} placeholder="Search the Acts register"
                  onSelect={(option) => { set('act', option ? { id: Number(option.value), label: option.label } : null); if (option && !form.act_rule.trim()) set('act_rule', option.label); }} />
                <LookupPicker label="Act / Rule document" type="resources" selected={form.resource} placeholder="Search the uploaded documents"
                  onSelect={(option) => set('resource', option ? { id: Number(option.value), label: option.label } : null)} />
              </div>
            </div>
          </details>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {finding && onRemove ? (
          <button type="button" onClick={onRemove} className="text-sm font-medium text-red-600 hover:underline">Clear this row</button>
        ) : <span />}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {form.result === 'ok' && <Button onClick={() => void save('final')} loading={saving === 'final'}>Save</Button>}
          {issue && (
            <>
              <Button variant="outline" onClick={() => void save('draft')} loading={saving === 'draft'}>Save as draft</Button>
              <Button onClick={() => void save('final')} loading={saving === 'final'}>Save &amp; sign off</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
