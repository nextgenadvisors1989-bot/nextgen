'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { useComplianceLookups } from '@/components/compliance/shared';
import { INSTRUMENT_STATUSES } from '@/lib/validations/compliance.validation';

export interface RegulationFormValues {
  id?: number;
  act_id: string;
  rule_id: string;
  regulation_name: string;
  regulation_number: string;
  issuing_authority: string;
  issue_date: string;
  effective_date: string;
  scope: string;
  obligations: string;
  reporting_authority: string;
  reporting_frequency: string;
  penalty_provision: string;
  status: string;
}

export const EMPTY_REGULATION: RegulationFormValues = {
  act_id: '', rule_id: '', regulation_name: '', regulation_number: '', issuing_authority: '',
  issue_date: '', effective_date: '', scope: '', obligations: '', reporting_authority: '',
  reporting_frequency: '', penalty_provision: '', status: 'active',
};

/** Create/edit form for the instruments (rules, schemes, orders) issued under an act. */
export function RegulationForm({ initial, mode }: { initial?: RegulationFormValues; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<RegulationFormValues>(initial ?? EMPTY_REGULATION);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { lookups } = useComplianceLookups(null, values.act_id || null);

  const set = (key: keyof RegulationFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value, ...(key === 'act_id' ? { rule_id: '' } : {}) }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      act_id: values.act_id ? Number(values.act_id) : null,
      rule_id: values.rule_id ? Number(values.rule_id) : null,
      regulation_name: values.regulation_name.trim(),
      regulation_number: values.regulation_number.trim() || null,
      issuing_authority: values.issuing_authority.trim() || null,
      issue_date: values.issue_date || null,
      effective_date: values.effective_date || null,
      scope: values.scope.trim() || null,
      obligations: values.obligations.trim() || null,
      reporting_authority: values.reporting_authority.trim() || null,
      reporting_frequency: values.reporting_frequency.trim() || null,
      penalty_provision: values.penalty_provision.trim() || null,
      status: values.status,
    };

    const result = mode === 'create'
      ? await api.post<{ regulationId: number }>('/api/admin/compliance/regulations', payload)
      : await api.put<{ regulationId: number }>(`/api/admin/compliance/regulations/${initial?.id}`, payload);

    setSaving(false);
    if (result.ok) {
      success(mode === 'create' ? 'Instrument added' : 'Instrument updated', `${payload.regulation_name} saved to the register.`);
      const id = (result.data as { regulationId?: number } | undefined)?.regulationId ?? initial?.id;
      router.push(`/admin/compliance/regulations/${id}`);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { regulation_name: result.message });
    errorToast(mode === 'create' ? 'Could not add the instrument' : 'Could not update the instrument', result.message);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Act" searchable value={values.act_id} error={errors.act_id} clearable
            placeholder="Select the parent act"
            options={(lookups?.actOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('act_id', value)}
          />
          <Select
            label="Obligation it gives effect to" searchable clearable value={values.rule_id} error={errors.rule_id}
            placeholder={values.act_id ? 'Optionally link an obligation' : 'Choose an act first'}
            disabled={!values.act_id}
            options={(lookups?.ruleOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('rule_id', value)}
          />
          <div className="sm:col-span-2">
            <Input label="Instrument name" required value={values.regulation_name} error={errors.regulation_name}
              placeholder="e.g. Tamil Nadu Factory Rules, 1950"
              onChange={(event) => set('regulation_name', event.target.value)} />
          </div>
          <Input label="Number / reference" value={values.regulation_number} error={errors.regulation_number}
            placeholder="e.g. G.O. Ms. No. 2229" onChange={(event) => set('regulation_number', event.target.value)} />
          <Input label="Issuing authority" value={values.issuing_authority} error={errors.issuing_authority}
            placeholder="e.g. Government of Tamil Nadu, Labour Department"
            onChange={(event) => set('issuing_authority', event.target.value)} />
          <DatePicker label="Issued on" value={values.issue_date} error={errors.issue_date}
            onChange={(value) => set('issue_date', value)} />
          <DatePicker label="In force from" value={values.effective_date} error={errors.effective_date}
            onChange={(value) => set('effective_date', value)} />
          <Input label="Reporting authority" value={values.reporting_authority} error={errors.reporting_authority}
            placeholder="e.g. Inspector of Factories" onChange={(event) => set('reporting_authority', event.target.value)} />
          <Input label="Reporting frequency" value={values.reporting_frequency} error={errors.reporting_frequency}
            placeholder="e.g. Annual licence renewal" onChange={(event) => set('reporting_frequency', event.target.value)} />
          <div className="sm:col-span-2">
            <Textarea label="Scope" rows={3} value={values.scope} error={errors.scope}
              placeholder="Who and what this instrument covers."
              onChange={(event) => set('scope', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Obligations it imposes" rows={4} value={values.obligations} error={errors.obligations}
              placeholder="Forms, registers, fees and returns required by this instrument."
              onChange={(event) => set('obligations', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Penalty provision" rows={2} value={values.penalty_provision} error={errors.penalty_provision}
              placeholder="e.g. Rule 118 read with section 92 of the Act."
              onChange={(event) => set('penalty_provision', event.target.value)} />
          </div>
          <Select
            label="Status" value={values.status} error={errors.status}
            options={INSTRUMENT_STATUSES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('status', value)}
          />
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{mode === 'create' ? 'Add Instrument' : 'Save Changes'}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
