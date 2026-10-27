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
import { ACT_STATUSES, JURISDICTIONS } from '@/lib/validations/compliance.validation';

export interface ActFormValues {
  id?: number;
  act_name: string;
  short_name: string;
  act_number: string;
  act_year: string;
  jurisdiction: string;
  state_name: string;
  ministry: string;
  department: string;
  enactment_date: string;
  effective_date: string;
  last_amended_date: string;
  applicability_criteria: string;
  industry_applicability: string;
  employee_threshold: string;
  summary: string;
  official_source_url: string;
  status: string;
}

export const EMPTY_ACT: ActFormValues = {
  act_name: '', short_name: '', act_number: '', act_year: '',
  jurisdiction: 'Central', state_name: '', ministry: '', department: '',
  enactment_date: '', effective_date: '', last_amended_date: '',
  applicability_criteria: '', industry_applicability: '', employee_threshold: '',
  summary: '', official_source_url: '', status: 'active',
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Create/edit form for an act. State legislation must name its state. */
export function ActForm({ initial, mode }: { initial?: ActFormValues; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<ActFormValues>(initial ?? EMPTY_ACT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ActFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      act_name: values.act_name.trim(),
      short_name: values.short_name.trim() || null,
      act_number: values.act_number.trim() || null,
      act_year: values.act_year ? Number(values.act_year) : null,
      jurisdiction: values.jurisdiction,
      state_name: values.jurisdiction === 'State' ? values.state_name || null : null,
      ministry: values.ministry.trim() || null,
      department: values.department.trim() || null,
      enactment_date: values.enactment_date || null,
      effective_date: values.effective_date || null,
      last_amended_date: values.last_amended_date || null,
      applicability_criteria: values.applicability_criteria.trim() || null,
      industry_applicability: values.industry_applicability.trim() || null,
      employee_threshold: values.employee_threshold.trim() || null,
      summary: values.summary.trim() || null,
      official_source_url: values.official_source_url.trim() || null,
      status: values.status,
    };

    const result = mode === 'create'
      ? await api.post<{ actId: number }>('/api/admin/compliance/acts', payload)
      : await api.put<{ actId: number }>(`/api/admin/compliance/acts/${initial?.id}`, payload);

    setSaving(false);
    if (result.ok) {
      success(mode === 'create' ? 'Act added' : 'Act updated', `${payload.act_name} saved to the register.`);
      const id = (result.data as { actId?: number } | undefined)?.actId ?? initial?.id;
      router.push(`/admin/compliance/acts/${id}`);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { act_name: result.message });
    errorToast(mode === 'create' ? 'Could not add the act' : 'Could not update the act', result.message);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Act name" required value={values.act_name} error={errors.act_name}
              placeholder="e.g. Factories Act, 1948"
              onChange={(event) => set('act_name', event.target.value)}
            />
          </div>
          <Input label="Short name" value={values.short_name} error={errors.short_name}
            placeholder="e.g. Factories Act" onChange={(event) => set('short_name', event.target.value)} />
          <Input label="Act number" value={values.act_number} error={errors.act_number}
            placeholder="e.g. 63 of 1948" onChange={(event) => set('act_number', event.target.value)} />
          <Input label="Year" type="number" min={1800} max={2100} value={values.act_year} error={errors.act_year}
            placeholder="1948" onChange={(event) => set('act_year', event.target.value)} />
          <Select
            label="Jurisdiction" value={values.jurisdiction} error={errors.jurisdiction}
            options={JURISDICTIONS.map((value) => ({ value, label: value }))}
            onChange={(value) => set('jurisdiction', value)}
          />
          {values.jurisdiction === 'State' && (
            <Select
              label="State" required searchable value={values.state_name} error={errors.state_name}
              placeholder="Select the state"
              options={INDIAN_STATES.map((value) => ({ value, label: value }))}
              onChange={(value) => set('state_name', value)}
            />
          )}
          <Select
            label="Status" value={values.status} error={errors.status}
            options={ACT_STATUSES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('status', value)}
          />
          <Input label="Ministry" value={values.ministry} error={errors.ministry}
            placeholder="e.g. Ministry of Labour and Employment"
            onChange={(event) => set('ministry', event.target.value)} />
          <Input label="Department / authority" value={values.department} error={errors.department}
            placeholder="e.g. Commissioner of Labour" onChange={(event) => set('department', event.target.value)} />
          <DatePicker label="Enacted on" value={values.enactment_date} error={errors.enactment_date}
            onChange={(value) => set('enactment_date', value)} />
          <DatePicker label="In force from" value={values.effective_date} error={errors.effective_date}
            onChange={(value) => set('effective_date', value)} />
          <DatePicker label="Last amended" value={values.last_amended_date} error={errors.last_amended_date}
            onChange={(value) => set('last_amended_date', value)} />
          <Input label="Official source URL" type="url" value={values.official_source_url} error={errors.official_source_url}
            placeholder="https://labour.gov.in/…" onChange={(event) => set('official_source_url', event.target.value)} />
          <Input label="Employee threshold" value={values.employee_threshold} error={errors.employee_threshold}
            placeholder="e.g. 20 or more" onChange={(event) => set('employee_threshold', event.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Industry applicability" value={values.industry_applicability} error={errors.industry_applicability}
              placeholder="e.g. Manufacturing, construction, shops and establishments"
              onChange={(event) => set('industry_applicability', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Who it applies to" rows={4} value={values.applicability_criteria} error={errors.applicability_criteria}
              placeholder="Thresholds and conditions that decide whether an establishment is covered."
              onChange={(event) => set('applicability_criteria', event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Summary" rows={4} value={values.summary} error={errors.summary}
              placeholder="What the act requires in practice."
              onChange={(event) => set('summary', event.target.value)}
            />
          </div>
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{mode === 'create' ? 'Add Act' : 'Save Changes'}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
