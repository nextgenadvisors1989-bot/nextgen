'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatCurrency } from '@/lib/utils/formatting';
import { AUDIT_PRIORITIES } from '@/types/audit';
import { ASSIGNMENT_TYPES } from '@/lib/validations/audit-assignment.validation';
import type { AuditAssignment } from '@/types/audit';

type FormState = Record<string, string>;

const EMPTY: FormState = {
  assignment_type: 'AUDIT',
  audit_title: '',
  module_id: '',
  employer_id: '',
  unit_id: '',
  department_id: '',
  auditor_id: '',
  verifier_id: '',
  start_date: '',
  end_date: '',
  due_date: '',
  audit_end_meeting_at: '',
  priority: 'Medium',
  scope: '',
  instructions: '',
  fee_amount: '',
  reminder_minutes: '1440',
};

export interface AssignmentLookups {
  employers: { id: number; company_name: string; employer_code: string; city: string | null }[];
  units: { id: number; employer_id: number; unit_name: string }[];
  departments: { id: number; employer_id: number; unit_id: number | null; department_name: string }[];
  auditors: {
    id: number; name: string; auditor_code: string; email: string; specialization: string | null;
    auditor_type_name: string | null; max_concurrent_audits: number; open_assignments: number;
  }[];
  verifiers: { id: number; name: string; email: string; pending_reviews: number }[];
  modules: { id: number; name: string; code: string; default_tat_days: number | null; requires_verification: number }[];
}

/**
 * Create / edit an audit assignment.
 *
 * Cascading pickers (employer → unit → department), auditor capacity shown
 * inline so an overloaded auditor is obvious before submitting, optional
 * dynamic-module link, schedule with a suggested due date, scope/instructions,
 * fee, and the notification switches that drive the email/SMS/WhatsApp fan-out.
 */
export function AssignmentForm({
  mode, assignment, lookups, canBulk = false,
}: {
  mode: 'create' | 'edit';
  assignment?: AuditAssignment;
  lookups: AssignmentLookups;
  canBulk?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'edit' && assignment) {
      const seeded: FormState = { ...EMPTY };
      for (const key of Object.keys(EMPTY)) {
        const value = (assignment as unknown as Record<string, unknown>)[key];
        seeded[key] = value === null || value === undefined ? '' : String(value);
      }
      // Split MySQL DATETIME for the native datetime-local input.
      if (assignment.audit_end_meeting_at) {
        seeded.audit_end_meeting_at = String(assignment.audit_end_meeting_at).slice(0, 16).replace(' ', 'T');
      }
      return seeded;
    }
    return EMPTY;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notifyAuditor, setNotifyAuditor] = useState(true);
  const [notifyVerifier, setNotifyVerifier] = useState(true);
  const [notifyEmployer, setNotifyEmployer] = useState(true);
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<string[]>([]);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const setSelect = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectedEmployerId = form.employer_id ? Number(form.employer_id) : null;
  const units = useMemo(
    () => lookups.units.filter((unit) => unit.employer_id === selectedEmployerId),
    [lookups.units, selectedEmployerId]
  );
  const departments = useMemo(
    () => lookups.departments.filter((department) =>
      department.employer_id === selectedEmployerId && (!form.unit_id || !department.unit_id || department.unit_id === Number(form.unit_id))
    ),
    [lookups.departments, selectedEmployerId, form.unit_id]
  );

  const auditor = lookups.auditors.find((entry) => String(entry.id) === form.auditor_id);
  const auditorAtCapacity = auditor ? auditor.open_assignments >= auditor.max_concurrent_audits : false;

  const selectedModule = lookups.modules.find((entry) => String(entry.id) === form.module_id);

  /** Suggested due date = start + the module's TAT (or 7 days). */
  function suggestDueDate() {
    const start = form.start_date;
    if (!start) return;
    const tat = selectedModule?.default_tat_days ?? 7;
    const due = new Date(start);
    due.setDate(due.getDate() + tat);
    const iso = due.toISOString().slice(0, 10);
    setForm((current) => ({ ...current, due_date: iso, end_date: current.end_date || iso }));
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      assignment_type: form.assignment_type,
      audit_title: form.audit_title,
      employer_id: form.employer_id ? Number(form.employer_id) : null,
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      department_id: form.department_id ? Number(form.department_id) : null,
      auditor_id: form.auditor_id ? Number(form.auditor_id) : null,
      verifier_id: form.verifier_id ? Number(form.verifier_id) : null,
      module_id: form.module_id ? Number(form.module_id) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      due_date: form.due_date || null,
      audit_end_meeting_at: form.audit_end_meeting_at ? form.audit_end_meeting_at.replace('T', ' ') : null,
      priority: form.priority,
      scope: form.scope || null,
      instructions: form.instructions || null,
      fee_amount: form.fee_amount === '' ? null : Number(form.fee_amount),
    };

    if (mode === 'create') {
      payload.notify_auditor = notifyAuditor;
      payload.notify_verifier = notifyVerifier;
      payload.notify_employer = notifyEmployer;
      payload.create_calendar_event = createCalendarEvent;
      payload.reminder_minutes = Number(form.reminder_minutes || 1440);
    }
    return payload;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = buildPayload();
    const result = mode === 'create'
      ? await api.post<{ assignmentId: number; assignmentNumber: string; warnings: string[] }>('/api/admin/audit-assignments', payload)
      : await api.put(`/api/admin/audit-assignments/${assignment?.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save assignment', result.message);
      return;
    }

    if (mode === 'create') {
      const created = result.raw as { assignmentId: number; assignmentNumber: string; warnings: string[] };
      success('Assignment created', `${created.assignmentNumber} was sent to ${auditor?.name ?? 'the auditor'} and added to the calendar.`);
      for (const warning of created.warnings ?? []) errorToast('Heads up', warning);
      router.push(`/admin/audit-assignments/${created.assignmentId}`);
    } else {
      success('Assignment updated', 'The schedule and details have been saved.');
      router.push(`/admin/audit-assignments/${assignment?.id}`);
    }
  }

  async function submitBulk() {
    if (!bulkTargets.length) {
      errorToast('Nothing selected', 'Pick at least one employer unit to assign.');
      return;
    }
    setSaving(true);
    const payload = buildPayload();
    delete payload.employer_id;
    delete payload.unit_id;
    delete payload.department_id;

    const targets = bulkTargets.map((key) => {
      const [employerId, unitId] = key.split(':');
      return { employer_id: Number(employerId), unit_id: unitId ? Number(unitId) : null };
    });

    const result = await api.post<{ created: { assignmentNumber: string }[]; warnings: string[] }>(
      '/api/admin/audit-assignments/bulk',
      { template: payload, targets }
    );
    setSaving(false);

    if (result.ok) {
      const created = result.raw as { created: { assignmentNumber: string }[]; warnings: string[] };
      success('Bulk assignments created', `${created.created.length} assignment(s): ${created.created.map((row) => row.assignmentNumber).join(', ')}`);
      for (const warning of created.warnings ?? []) errorToast('Heads up', warning);
      router.push('/admin/audit-assignments');
    } else {
      setErrors(fieldErrors(result));
      errorToast('Could not create assignments', result.message);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card padded={false}>
        <CardHeader title="What is being audited" description="Assignment type, title and the optional audit module" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select label="Assignment Type" required value={form.assignment_type} onChange={setSelect('assignment_type')}
            options={ASSIGNMENT_TYPES.map((type) => ({ value: type, label: type.replace('_', ' ') }))} />
          <div className="md:col-span-2">
            <Input label="Audit Title" requiredMark value={form.audit_title} onChange={set('audit_title')} error={errors.audit_title}
              placeholder="e.g. Annual Factory Act compliance audit — Spinning Unit" />
          </div>
          <Select label="Audit Module" value={form.module_id} onChange={setSelect('module_id')} error={errors.module_id}
            placeholder="Standard audit (no module)" searchable
            options={lookups.modules.map((module) => ({ value: String(module.id), label: `${module.name} (${module.code})` }))} />
          <div className="md:col-span-2 xl:col-span-3">
            <Textarea label="Scope" rows={3} value={form.scope} onChange={set('scope')} error={errors.scope}
              placeholder="Statutes, units, shifts and records covered by this audit." />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Textarea label="Instructions to the auditor" rows={3} value={form.instructions} onChange={set('instructions')}
              error={errors.instructions}
              placeholder="What the auditor must verify, which registers to inspect, who to meet." />
          </div>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Where — employer, unit and department" description="Scope the audit to a unit or department, or leave blank for the whole company" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select label="Employer" required value={form.employer_id} error={errors.employer_id} searchable
            placeholder="Select employer"
            onChange={(value) => setForm((current) => ({ ...current, employer_id: value, unit_id: '', department_id: '' }))}
            options={lookups.employers.map((employer) => ({
              value: String(employer.id),
              label: employer.company_name,
              hint: [employer.employer_code, employer.city].filter(Boolean).join(' · '),
            }))} />
          <Select label="Unit" value={form.unit_id} error={errors.unit_id} clearable
            placeholder={selectedEmployerId ? 'All units' : 'Select an employer first'}
            disabled={!selectedEmployerId}
            onChange={(value) => setForm((current) => ({ ...current, unit_id: value, department_id: '' }))}
            options={units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))} />
          <Select label="Department" value={form.department_id} error={errors.department_id} clearable
            placeholder={selectedEmployerId ? 'All departments' : 'Select an employer first'}
            disabled={!selectedEmployerId}
            onChange={setSelect('department_id')}
            options={departments.map((department) => ({ value: String(department.id), label: department.department_name }))} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Who — auditor and verifier" description="Auditor capacity is checked before the assignment is sent" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select label="Auditor" required value={form.auditor_id} error={errors.auditor_id} searchable
            placeholder="Select auditor"
            onChange={setSelect('auditor_id')}
            options={lookups.auditors.map((entry) => ({
              value: String(entry.id),
              label: `${entry.name} (${entry.auditor_code})`,
              hint: `${entry.open_assignments}/${entry.max_concurrent_audits} open${entry.specialization ? ` · ${entry.specialization}` : ''}`,
            }))} />
          <Select label="Verifier" value={form.verifier_id} error={errors.verifier_id} clearable searchable
            placeholder="Assign a verifier (optional)"
            onChange={setSelect('verifier_id')}
            options={lookups.verifiers.map((entry) => ({
              value: String(entry.id),
              label: entry.name,
              hint: `${entry.pending_reviews} awaiting review · ${entry.email}`,
            }))} />
          {auditor && (
            <div className="flex items-end">
              <div className="w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs">
                <span className="block font-medium text-ink">{auditor.name}</span>
                <span className="block text-ink-muted">
                  {auditor.auditor_type_name ?? 'Auditor'}
                  {auditor.specialization ? ` · ${auditor.specialization}` : ''} · {auditor.email}
                </span>
                <span className={auditorAtCapacity ? 'mt-1 inline-block text-red-600' : 'mt-1 inline-block text-emerald-600'}>
                  {auditorAtCapacity
                    ? `At capacity — ${auditor.open_assignments} of ${auditor.max_concurrent_audits} already open`
                    : `${auditor.max_concurrent_audits - auditor.open_assignments} slot(s) free`}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="When — schedule and priority"
          description="The schedule creates calendar entries for the audit and its closing meeting"
          action={
            <Button type="button" variant="outline" size="sm" onClick={suggestDueDate} disabled={!form.start_date}>
              Suggest due date
            </Button>
          }
        />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Start Date" type="date" value={form.start_date} onChange={set('start_date')} error={errors.start_date} />
          <Input label="End Date" type="date" value={form.end_date} onChange={set('end_date')} error={errors.end_date} />
          <Input label="Due Date" type="date" value={form.due_date} onChange={set('due_date')} error={errors.due_date}
            helper={selectedModule?.default_tat_days ? `Module TAT: ${selectedModule.default_tat_days} day(s)` : 'Auditor must submit by this date.'} />
          <Input label="Closing Meeting" type="datetime-local" value={form.audit_end_meeting_at}
            onChange={set('audit_end_meeting_at')} error={errors.audit_end_meeting_at} />
          <Select label="Priority" value={form.priority} onChange={setSelect('priority')} error={errors.priority}
            options={AUDIT_PRIORITIES.map((priority) => ({ value: priority, label: priority }))} />
          <Input label="Audit Fee" type="number" min={0} step="0.01" value={form.fee_amount} onChange={set('fee_amount')}
            error={errors.fee_amount} placeholder="0.00"
            helper={form.fee_amount ? `Recorded as ${formatCurrency(Number(form.fee_amount))}` : 'Optional — for billing the employer.'} />
          {mode === 'create' && (
            <Select label="Calendar Reminder" value={form.reminder_minutes} onChange={setSelect('reminder_minutes')}
              options={[
                { value: '60', label: '1 hour before' },
                { value: '240', label: '4 hours before' },
                { value: '1440', label: '1 day before' },
                { value: '2880', label: '2 days before' },
                { value: '10080', label: '1 week before' },
              ]} />
          )}
        </CardBody>
      </Card>

      {mode === 'create' && (
        <Card padded={false}>
          <CardHeader title="Notifications" description="Who gets told, and on which channels" />
          <CardBody className="space-y-3">
            <Checkbox label="Email + SMS + WhatsApp the auditor with the brief and the due date" checked={notifyAuditor}
              onChange={(event) => setNotifyAuditor((event.target as HTMLInputElement).checked)} />
            <Checkbox label="Notify the verifier that a report will be coming their way" checked={notifyVerifier}
              onChange={(event) => setNotifyVerifier((event.target as HTMLInputElement).checked)} />
            <Checkbox label="Notify the employer contact and their portal users" checked={notifyEmployer}
              onChange={(event) => setNotifyEmployer((event.target as HTMLInputElement).checked)} />
            <Checkbox label="Create calendar entries for the audit dates and the closing meeting" checked={createCalendarEvent}
              onChange={(event) => setCreateCalendarEvent((event.target as HTMLInputElement).checked)} />
            <p className="text-xs text-ink-muted">
              Administrators always receive an in-app copy so nothing is assigned silently. Delivery channels follow the
              templates configured under Settings → Integrations.
            </p>
          </CardBody>
        </Card>
      )}

      {mode === 'edit' && (
        <Card padded={false}>
          <CardHeader title="Status & progress" description="Day-to-day progress is recorded by the auditor; administrators can correct it here" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select label="Status" value={form.status ?? ''} onChange={setSelect('status')}
              options={['Not Started', 'In Progress', 'Draft Saved', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Changes Requested', 'Overdue', 'Cancelled']
                .map((status) => ({ value: status, label: status }))} />
            <Input label="Progress %" type="number" min={0} max={100} value={form.progress_percent ?? ''} onChange={set('progress_percent')} />
            <div className="flex items-end">
              <p className="text-xs text-ink-muted">
                Approving sets the completion timestamp automatically; other status changes clear it.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === 'create' && canBulk && lookups.employers.length > 1 && (
          <Button type="button" variant="outline" onClick={() => setBulkOpen((open) => !open)}>
            {bulkOpen ? 'Hide bulk options' : 'Assign to multiple units…'}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <LinkButton href={mode === 'edit' && assignment ? `/admin/audit-assignments/${assignment.id}` : '/admin/audit-assignments'} variant="outline">
            Cancel
          </LinkButton>
          {bulkOpen ? (
            <Button type="button" onClick={submitBulk} loading={saving}>Create {bulkTargets.length || ''} Assignments</Button>
          ) : (
            <Button type="submit" loading={saving}>{mode === 'create' ? 'Create & Notify' : 'Save Changes'}</Button>
          )}
        </div>
      </div>

      {bulkOpen && (
        <Card padded={false}>
          <CardHeader
            title="Bulk assignment"
            description="The details above are reused for every unit ticked here. Each unit gets its own assignment number and auditor notification."
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lookups.employers.flatMap((employer) => {
                const employerUnits = lookups.units.filter((unit) => unit.employer_id === employer.id);
                const options = employerUnits.length
                  ? employerUnits.map((unit) => ({ key: `${employer.id}:${unit.id}`, label: `${employer.company_name} — ${unit.unit_name}` }))
                  : [{ key: `${employer.id}:`, label: `${employer.company_name} — all units` }];
                return options.map((option) => (
                  <Checkbox
                    key={option.key}
                    label={option.label}
                    checked={bulkTargets.includes(option.key)}
                    onChange={(event) => {
                      const checked = (event.target as HTMLInputElement).checked;
                      setBulkTargets((current) => checked ? [...current, option.key] : current.filter((key) => key !== option.key));
                    }}
                  />
                ));
              })}
            </div>
            {bulkTargets.length > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                <Badge tone="brand">{bulkTargets.length} target(s)</Badge> will be created with the auditor, verifier,
                schedule and instructions entered above.
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </form>
  );
}
