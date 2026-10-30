'use client';

/**
 * "New CAPAR" dialog.
 *   auditor        picks one of the audits the administrator assigned to them; the company, unit, audit date and verifier come from that audit
 *                  and are shown, not typed.
 *   administrator  may start a report for any company (and unit, audit, verifier).
 * The facility details, representative and audit firm are prefilled from the records.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { StandardsPicker, splitStandards } from '@/components/capar/standards-picker';

interface Option { value: string; label: string; hint?: string }
interface MyAudit extends Option {
  employerId: number; company: string; unit: string | null; auditDate: string | null; verifierId: number | null; verifier: string | null; status: string; packSubmitted: boolean;
}

async function lookup<T = Option>(type: string, extra = ''): Promise<T[]> {
  const result = await api.get<T[]>(`/api/capar/lookups?type=${type}${extra}`);
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

export function CaparCreateModal({ open, onClose, panel }: { open: boolean; onClose: () => void; panel: 'auditor' | 'admin' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const isAuditor = panel === 'auditor';
  const [employers, setEmployers] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [assignments, setAssignments] = useState<Option[]>([]);
  const [audits, setAudits] = useState<MyAudit[] | null>(null);
  const [verifiers, setVerifiers] = useState<Option[]>([]);
  const [auditTypes, setAuditTypes] = useState<Option[]>([]);
  const [standards, setStandards] = useState<string[]>([]);
  const [form, setForm] = useState({ employer_id: '', unit_id: '', assignment_id: '', verifier_id: '', audit_date: '', title: '', audit_type_id: '', audit_purpose: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api.get<{ id: number; name: string; status: string }[]>('/api/compliance-register/types').then((result) => {
      if (result.ok && Array.isArray(result.data)) setAuditTypes(result.data.filter((type) => type.status === 'active').map((type) => ({ value: String(type.id), label: type.name })));
    });
    if (isAuditor) { void lookup<MyAudit>('myaudits').then(setAudits); return; }
    void lookup('employers').then(setEmployers);
    void lookup('verifiers').then(setVerifiers);
  }, [open, isAuditor]);

  useEffect(() => {
    if (isAuditor) return;
    // A unit and an audit assignment belong to one company: picking another company must drop the earlier choice.
    setUnits([]);
    setAssignments([]);
    setForm((current) => (current.unit_id || current.assignment_id ? { ...current, unit_id: '', assignment_id: '' } : current));
    if (!form.employer_id) return;
    void lookup('units', `&employerId=${form.employer_id}`).then(setUnits);
    void lookup('assignments', `&employerId=${form.employer_id}`).then(setAssignments);
  }, [form.employer_id, isAuditor]);

  const set = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const chosen = isAuditor ? audits?.find((audit) => audit.value === form.assignment_id) ?? null : null;
  const buyerType = (auditTypes.find((type) => type.value === form.audit_type_id)?.label ?? '').startsWith('International Buyer');

  async function create() {
    setSaving(true);
    setErrors({});
    const body = isAuditor
      ? { assignment_id: form.assignment_id || undefined, title: form.title || null, audit_type_id: form.audit_type_id || undefined, buyer_standards: buyerType ? standards.join(', ') : null, audit_purpose: form.audit_purpose || null }
      : {
          employer_id: form.employer_id || undefined,
          unit_id: form.unit_id || null,
          assignment_id: form.assignment_id || null,
          verifier_id: form.verifier_id || null,
          audit_date: form.audit_date || null,
          title: form.title || null,
          audit_type_id: form.audit_type_id || null,
          buyer_standards: buyerType ? standards.join(', ') : null,
          audit_purpose: form.audit_purpose || null,
        };
    const result = await api.post<{ id: number }>('/api/capar', body);
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not start the report', result.message);
      return;
    }
    success('CAPAR report started', 'Tick the categories you are auditing, then record the findings.');
    onClose();
    router.push(`/${panel}/capar/${result.data?.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New CAPAR report"
      description={isAuditor ? 'Choose the audit you are reporting on. Its company, unit, date and verifier are filled in for you.' : 'Corrective Action and Preventive Action Report: start with the facility that was audited.'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={isAuditor ? !form.assignment_id || !form.audit_type_id || form.audit_purpose.trim().length < 5 : !form.employer_id}>Start report</Button>
        </div>
      }
    >
      {isAuditor ? (
        <div className="space-y-4">
          {audits === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading your audits...</p>
          ) : audits.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">No audit has been assigned to you yet. Ask the administrator to assign you an audit, then it appears here.</p>
          ) : (
            <>
              <Select
                label="Audit"
                required
                searchable
                options={audits.map((audit) => ({ value: audit.value, label: audit.label, hint: audit.hint }))}
                value={form.assignment_id}
                onChange={set('assignment_id')}
                placeholder="Choose the audit assigned to you"
                error={errors.assignment_id}
              />
              {chosen && (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface-muted p-4 text-sm sm:grid-cols-2">
                  <Fact label="Company" value={chosen.company} />
                  <Fact label="Unit / facility" value={chosen.unit ?? 'All units'} />
                  <Fact label="Audit date" value={chosen.auditDate ? formatDate(chosen.auditDate) : 'Not set'} />
                </dl>
              )}
              {chosen && !chosen.packSubmitted && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This company has not submitted its Audit Documents yet. You can start the report; ask the employer to submit them from the employer portal when you can.</p>
              )}
              {form.assignment_id && (
                <>
                  <Select label="Which audit or assessment is this?" required searchable options={auditTypes} value={form.audit_type_id} onChange={set('audit_type_id')} placeholder="Choose from the list" error={errors.audit_type_id} />
                  {buyerType && <StandardsPicker label="Buyer standards being audited" value={standards.join(', ')} onChange={(value) => setStandards(splitStandards(value))} />}
                  <Textarea label="Why is this audit being done?" required rows={3} value={form.audit_purpose} onChange={(event) => set('audit_purpose')(event.target.value)} placeholder="e.g. Buyer audit before the new season order, statutory check, customer request" error={errors.audit_purpose} />
                </>
              )}
              <Input label="Report title (optional)" value={form.title} onChange={(event) => set('title')(event.target.value)} placeholder="Left blank, it is named after the facility and audit date" error={errors.title} />
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select label="Company audited" required searchable options={employers} value={form.employer_id} onChange={set('employer_id')} placeholder="Choose the employer" error={errors.employer_id} />
          </div>
          <Select label="Unit / facility" options={units} value={form.unit_id} onChange={set('unit_id')} placeholder={form.employer_id ? 'All units' : 'Choose the employer first'} clearable disabled={!units.length} />
          <Select label="Audit assignment" helper="Optional: links the report to a scheduled audit and copies its verifier." options={assignments} value={form.assignment_id} onChange={set('assignment_id')} placeholder="Not linked" clearable disabled={!assignments.length} />
          <DatePicker label="Audit date" value={form.audit_date} onChange={set('audit_date')} error={errors.audit_date} />
          <Select label="Audit or assessment" options={auditTypes} value={form.audit_type_id} onChange={set('audit_type_id')} placeholder="Choose from the list" searchable clearable />
          <div className="sm:col-span-2">
            <Input label="Report title" value={form.title} onChange={(event) => set('title')(event.target.value)} placeholder="Left blank, it is named after the facility and audit date" error={errors.title} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
