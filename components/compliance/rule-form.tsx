'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { useComplianceLookups } from '@/components/compliance/shared';
import { COMPLIANCE_FREQUENCIES, COMPLIANCE_TYPES, RULE_STATUSES } from '@/lib/validations/compliance.validation';

export interface RuleFormValues {
  id?: number;
  act_id: string;
  rule_number: string;
  rule_title: string;
  rule_text: string;
  compliance_type: string;
  frequency: string;
  due_day_of_month: string;
  responsible_role: string;
  penalty_details: string;
  evidence_required: string;
  applicability: string;
  status: string;
}

export const EMPTY_RULE: RuleFormValues = {
  act_id: '', rule_number: '', rule_title: '', rule_text: '', compliance_type: 'Mandatory',
  frequency: 'Monthly', due_day_of_month: '', responsible_role: '', penalty_details: '',
  evidence_required: '', applicability: '', status: 'active',
};

const PERIODIC = ['Monthly', 'Quarterly', 'Half-Yearly', 'Bi-Annual', 'Annual'];

/** Create/edit form for an obligation, with the due day required for periodic duties. */
export function RuleForm({ initial, mode }: { initial?: RuleFormValues; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<RuleFormValues>(initial ?? EMPTY_RULE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { lookups } = useComplianceLookups(null);

  const periodic = PERIODIC.includes(values.frequency);

  const set = (key: keyof RuleFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value, ...(key === 'frequency' && !PERIODIC.includes(value) ? { due_day_of_month: '' } : {}) }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      act_id: values.act_id ? Number(values.act_id) : null,
      rule_number: values.rule_number.trim() || null,
      rule_title: values.rule_title.trim(),
      rule_text: values.rule_text.trim() || null,
      compliance_type: values.compliance_type,
      frequency: values.frequency || null,
      due_day_of_month: periodic && values.due_day_of_month ? Number(values.due_day_of_month) : null,
      responsible_role: values.responsible_role.trim() || null,
      penalty_details: values.penalty_details.trim() || null,
      evidence_required: values.evidence_required.trim() || null,
      applicability: values.applicability.trim() || null,
      status: values.status,
    };

    const result = mode === 'create'
      ? await api.post<{ ruleId: number }>('/api/admin/compliance/rules', payload)
      : await api.put<{ ruleId: number }>(`/api/admin/compliance/rules/${initial?.id}`, payload);

    setSaving(false);
    if (result.ok) {
      success(mode === 'create' ? 'Obligation added' : 'Obligation updated', `${payload.rule_title} saved to the register.`);
      const id = (result.data as { ruleId?: number } | undefined)?.ruleId ?? initial?.id;
      router.push(`/admin/compliance/rules/${id}`);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { rule_title: result.message });
    errorToast(mode === 'create' ? 'Could not add the obligation' : 'Could not update the obligation', result.message);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Act" required searchable value={values.act_id} error={errors.act_id}
            placeholder="Select the act this obligation sits under"
            options={(lookups?.actOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('act_id', value)}
          />
          <Input label="Rule number / clause" value={values.rule_number} error={errors.rule_number}
            placeholder="e.g. F-01 or Section 7A" onChange={(event) => set('rule_number', event.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Obligation" required value={values.rule_title} error={errors.rule_title}
              placeholder="e.g. Monthly provident fund contributions and ECR filing"
              onChange={(event) => set('rule_title', event.target.value)} />
          </div>
          <Select
            label="Compliance type" value={values.compliance_type} error={errors.compliance_type}
            options={COMPLIANCE_TYPES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('compliance_type', value)}
          />
          <Select
            label="Frequency" value={values.frequency} error={errors.frequency}
            options={COMPLIANCE_FREQUENCIES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('frequency', value)}
          />
          <Input
            label="Due day of the month" type="number" min={1} max={31}
            value={values.due_day_of_month} error={errors.due_day_of_month}
            disabled={!periodic}
            placeholder={periodic ? 'e.g. 15' : 'Not applicable for this frequency'}
            helper={periodic ? 'Recurring obligations need the day they fall due so reminders can fire.' : undefined}
            onChange={(event) => set('due_day_of_month', event.target.value)}
          />
          <Input label="Responsible role" value={values.responsible_role} error={errors.responsible_role}
            placeholder="e.g. Payroll Manager" onChange={(event) => set('responsible_role', event.target.value)} />
          <div className="sm:col-span-2">
            <Textarea label="What must be done" rows={4} value={values.rule_text} error={errors.rule_text}
              placeholder="State the duty precisely — what is filed, paid, tested or displayed, and by when."
              onChange={(event) => set('rule_text', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Evidence the auditor will ask for" rows={3} value={values.evidence_required} error={errors.evidence_required}
              placeholder="e.g. Monthly challan, ECR acknowledgement, bank remittance proof."
              onChange={(event) => set('evidence_required', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Penalty for non-compliance" rows={3} value={values.penalty_details} error={errors.penalty_details}
              placeholder="e.g. Section 14B damages up to the arrears, 12% interest per annum, prosecution under section 14."
              onChange={(event) => set('penalty_details', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Applicability notes" rows={2} value={values.applicability} error={errors.applicability}
              placeholder="Thresholds, exemptions or conditions that decide whether this obligation binds the employer."
              onChange={(event) => set('applicability', event.target.value)} />
          </div>
          <Select
            label="Status" value={values.status} error={errors.status}
            options={RULE_STATUSES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('status', value)}
          />
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{mode === 'create' ? 'Add Obligation' : 'Save Changes'}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
