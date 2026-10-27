'use client';

/**
 * "New CAPAR" dialog. The auditor picks the company that was audited (and, optionally, the unit and the audit assignment it
 * belongs to); the facility details, representative and audit firm are prefilled from the records and can be edited in the
 * report itself.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface Option { value: string; label: string; hint?: string }

async function lookup(type: string, extra = ''): Promise<Option[]> {
  const result = await api.get<Option[]>(`/api/capar/lookups?type=${type}${extra}`);
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

export function CaparCreateModal({ open, onClose, panel }: { open: boolean; onClose: () => void; panel: 'auditor' | 'admin' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [employers, setEmployers] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [assignments, setAssignments] = useState<Option[]>([]);
  const [verifiers, setVerifiers] = useState<Option[]>([]);
  const [form, setForm] = useState({ employer_id: '', unit_id: '', assignment_id: '', verifier_id: '', audit_date: '', title: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void lookup('employers').then(setEmployers);
    void lookup('verifiers').then(setVerifiers);
  }, [open]);

  useEffect(() => {
    setUnits([]);
    setAssignments([]);
    if (!form.employer_id) return;
    void lookup('units', `&employerId=${form.employer_id}`).then(setUnits);
    void lookup('assignments', `&employerId=${form.employer_id}`).then(setAssignments);
  }, [form.employer_id]);

  const set = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function create() {
    setSaving(true);
    setErrors({});
    const result = await api.post<{ id: number }>('/api/capar', {
      employer_id: form.employer_id || undefined,
      unit_id: form.unit_id || null,
      assignment_id: form.assignment_id || null,
      verifier_id: form.verifier_id || null,
      audit_date: form.audit_date || null,
      title: form.title || null,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not start the report', result.message);
      return;
    }
    success('CAPAR report started', 'Add the findings, then submit it for verification.');
    onClose();
    router.push(`/${panel}/capar/${result.data?.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New CAPAR report"
      description="Corrective Action Plan Acknowledgement Report: start with the facility you audited, then record the findings."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={!form.employer_id}>Start report</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select
            label="Company audited"
            required
            searchable
            options={employers}
            value={form.employer_id}
            onChange={set('employer_id')}
            placeholder="Choose the employer"
            error={errors.employer_id}
          />
        </div>
        <Select label="Unit / facility" options={units} value={form.unit_id} onChange={set('unit_id')} placeholder={form.employer_id ? 'All units' : 'Choose the employer first'} clearable disabled={!units.length} />
        <Select
          label="Audit assignment"
          helper="Optional: links the report to a scheduled audit and copies its verifier."
          options={assignments}
          value={form.assignment_id}
          onChange={set('assignment_id')}
          placeholder="Not linked"
          clearable
          disabled={!assignments.length}
        />
        <DatePicker label="Audit date" value={form.audit_date} onChange={set('audit_date')} error={errors.audit_date} />
        <Select label="Verifier" options={verifiers} value={form.verifier_id} onChange={set('verifier_id')} placeholder="Choose who reviews it" searchable clearable />
        <div className="sm:col-span-2">
          <Input
            label="Report title"
            value={form.title}
            onChange={(event) => set('title')(event.target.value)}
            placeholder="Left blank, it is named after the facility and audit date"
            error={errors.title}
          />
        </div>
      </div>
    </Modal>
  );
}
