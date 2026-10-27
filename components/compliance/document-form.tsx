'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { useComplianceLookups } from '@/components/compliance/shared';
import { DOCUMENT_TYPES, EXPIRY_STATUSES } from '@/lib/validations/compliance.validation';
import { formatCurrency } from '@/lib/utils/formatting';

export interface DocumentFormValues {
  id?: number;
  employer_id: string;
  unit_id: string;
  document_name: string;
  document_type: string;
  document_number: string;
  issuing_authority: string;
  act_id: string;
  rule_id: string;
  issue_date: string;
  expiry_date: string;
  validity_period_days: string;
  remind_days_before: string;
  renewal_responsibility: string;
  fee_amount: string;
  notes: string;
  is_verified: boolean;
  file_id?: number | null;
}

export const EMPTY_DOCUMENT: DocumentFormValues = {
  employer_id: '', unit_id: '', document_name: '', document_type: 'Licence', document_number: '',
  issuing_authority: '', act_id: '', rule_id: '', issue_date: '', expiry_date: '',
  validity_period_days: '', remind_days_before: '30', renewal_responsibility: '',
  fee_amount: '', notes: '', is_verified: false, file_id: null,
};

/**
 * Create/edit form for an employer's compliance document. Employers are pinned to
 * their own company by the server, and the derived status is shown live so the
 * user sees what the register will record.
 */
export function DocumentForm({
  initial, mode, lockedEmployer, idField = 'id',
}: {
  initial?: DocumentFormValues;
  mode: 'create' | 'edit';
  /** Set on the employer panel: the company selector becomes a read-only line. */
  lockedEmployer?: { id: number; name: string };
  /** The route's parameter name — admin uses documentId, the employer panel too. */
  idField?: string;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<DocumentFormValues>(initial ?? EMPTY_DOCUMENT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const employerId = lockedEmployer ? String(lockedEmployer.id) : values.employer_id;
  const { lookups } = useComplianceLookups(employerId, values.act_id || null);

  const base = lockedEmployer ? '/api/employer/compliance-documents' : '/api/admin/compliance/documents';

  const derived = useMemo(() => {
    const expiry = values.expiry_date || (values.issue_date && values.validity_period_days
      ? new Date(new Date(`${values.issue_date}T00:00:00`).getTime() + Number(values.validity_period_days) * 86_400_000).toISOString().slice(0, 10)
      : '');
    if (!expiry) return { expiry, status: 'Valid', days: null as number | null };
    const days = Math.round((new Date(`${expiry}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    const remind = Number(values.remind_days_before || 30);
    const status = days < 0 ? 'Expired' : days <= remind ? 'Expiring Soon' : 'Valid';
    return { expiry, status, days };
  }, [values.expiry_date, values.issue_date, values.validity_period_days, values.remind_days_before]);

  const set = (key: keyof DocumentFormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload: Record<string, unknown> = {
      document_name: values.document_name.trim(),
      document_type: values.document_type,
      document_number: values.document_number.trim() || null,
      issuing_authority: values.issuing_authority.trim() || null,
      act_id: values.act_id ? Number(values.act_id) : null,
      rule_id: values.rule_id ? Number(values.rule_id) : null,
      issue_date: values.issue_date || null,
      expiry_date: values.expiry_date || null,
      validity_period_days: values.validity_period_days ? Number(values.validity_period_days) : null,
      remind_days_before: values.remind_days_before ? Number(values.remind_days_before) : 30,
      renewal_responsibility: values.renewal_responsibility.trim() || null,
      fee_amount: values.fee_amount ? Number(values.fee_amount) : null,
      notes: values.notes.trim() || null,
      is_verified: values.is_verified,
      file_id: values.file_id ?? null,
      unit_id: values.unit_id ? Number(values.unit_id) : null,
    };
    if (!lockedEmployer) {
      payload.employer_id = values.employer_id ? Number(values.employer_id) : null;
    }

    const result = mode === 'create'
      ? await api.post<{ documentId: number }>(base, payload)
      : await api.put<{ documentId: number }>(`${base}/${initial?.id}`, payload);

    setSaving(false);
    if (result.ok) {
      success(
        mode === 'create' ? 'Document recorded' : 'Document updated',
        `${payload.document_name} is ${derived.status}${derived.days !== null ? ` — ${derived.days} day(s) to expiry` : ''}.`
      );
      const id = (result.data as { documentId?: number } | undefined)?.documentId ?? initial?.id;
      router.push(lockedEmployer ? '/employer/compliance-documents' : `/admin/compliance/documents/${id}`);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { document_name: result.message });
    errorToast(mode === 'create' ? 'Could not record the document' : 'Could not update the document', result.message);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lockedEmployer ? (
            <div className="sm:col-span-2 rounded-lg border border-line bg-surface-muted px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Employer</p>
              <p className="text-sm font-medium text-ink">{lockedEmployer.name}</p>
            </div>
          ) : (
            <Select
              label="Employer" required searchable value={values.employer_id} error={errors.employer_id}
              placeholder="Select the employer"
              options={(lookups?.employerOptions ?? []).map((option) => ({ value: option.value, label: option.label, hint: option.hint }))}
              onChange={(value) => { set('employer_id', value); set('unit_id', ''); }}
            />
          )}
          <Select
            label="Unit / branch" value={values.unit_id} error={errors.unit_id} clearable
            placeholder={employerId ? 'Applies to the whole company' : 'Choose an employer first'}
            disabled={!employerId}
            options={(lookups?.unitOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('unit_id', value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Document name" required value={values.document_name} error={errors.document_name}
              placeholder="e.g. Factory Licence 2026-27"
              onChange={(event) => set('document_name', event.target.value)}
            />
          </div>
          <Select
            label="Document type" value={values.document_type} error={errors.document_type}
            options={DOCUMENT_TYPES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('document_type', value)}
          />
          <Input label="Document number" value={values.document_number} error={errors.document_number}
            placeholder="e.g. TN/FAC/2026/00123"
            onChange={(event) => set('document_number', event.target.value)} />
          <Input label="Issuing authority" value={values.issuing_authority} error={errors.issuing_authority}
            placeholder="e.g. Inspector of Factories, Chennai"
            onChange={(event) => set('issuing_authority', event.target.value)} />
          <Input label="Renewal responsibility" value={values.renewal_responsibility} error={errors.renewal_responsibility}
            placeholder="e.g. Safety Officer"
            onChange={(event) => set('renewal_responsibility', event.target.value)} />
          <Select
            label="Act it satisfies" clearable searchable value={values.act_id} error={errors.act_id}
            placeholder="Optionally link the act"
            options={(lookups?.actOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => { set('act_id', value); set('rule_id', ''); }}
          />
          <Select
            label="Obligation it satisfies" clearable searchable value={values.rule_id} error={errors.rule_id}
            placeholder={values.act_id ? 'Optionally link the obligation' : 'Choose an act first'}
            disabled={!values.act_id}
            options={(lookups?.ruleOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('rule_id', value)}
          />
          <DatePicker label="Issue date" value={values.issue_date} error={errors.issue_date}
            onChange={(value) => set('issue_date', value)} />
          <DatePicker label="Expiry date" value={values.expiry_date} error={errors.expiry_date}
            helper={values.validity_period_days && values.issue_date ? 'Leave blank to use the validity period' : undefined}
            onChange={(value) => set('expiry_date', value)} />
          <Input label="Validity period (days)" type="number" min={1} max={36500}
            value={values.validity_period_days} error={errors.validity_period_days}
            placeholder="e.g. 365" onChange={(event) => set('validity_period_days', event.target.value)} />
          <Input label="Remind how many days before expiry" type="number" min={1} max={365}
            value={values.remind_days_before} error={errors.remind_days_before}
            onChange={(event) => set('remind_days_before', event.target.value)} />
          <Input label="Fee paid (₹)" type="number" min={0} step="0.01"
            value={values.fee_amount} error={errors.fee_amount}
            placeholder="e.g. 5500" onChange={(event) => set('fee_amount', event.target.value)} />

          <div className="sm:col-span-2 rounded-lg border border-line bg-surface-muted px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Register status</p>
            <p className="mt-1 text-sm text-ink">
              {derived.expiry
                ? <>Expires <strong>{derived.expiry}</strong> — will be recorded as <strong>{derived.status}</strong>
                  {derived.days !== null ? ` (${derived.days} day(s) from today)` : ''}.</>
                : 'No expiry date yet — the register will treat this document as perpetually valid.'}
            </p>
            {derived.status === 'Expired' && (
              <p className="mt-1 text-xs text-amber-700">
                A lapsed document is flagged on the dashboard and picked up by the nightly expiry reminders.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Textarea label="Notes" rows={3} value={values.notes} error={errors.notes}
              placeholder="Renewal history, conditions on the licence, who holds the original…"
              onChange={(event) => set('notes', event.target.value)} />
          </div>
          <Checkbox
            label="Verified against the original"
            checked={values.is_verified}
            onChange={(event) => set('is_verified', event.target.checked)}
          />
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{mode === 'create' ? 'Record Document' : 'Save Changes'}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
