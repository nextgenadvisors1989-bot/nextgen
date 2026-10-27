'use client';

/** Add or edit one designation: its place in an industry, skill level, nature of work and the five-line wage mapping. */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

export interface DesignationLookups {
  industries: { code: string; name: string; count: number }[];
  levels: string[];
  categories: string[];
  departments: string[];
}

export interface DesignationRow {
  id: number;
  employer_id: number | null;
  employer_name?: string | null;
  industry_code: string | null;
  industry_name: string | null;
  group_name: string | null;
  designation_name: string;
  department: string | null;
  skill_level: string | null;
  level_inferred: boolean;
  nature_of_work: string | null;
  statutory_category: string | null;
  wage_basic: number | null;
  wage_da: number | null;
  wage_allowance: number | null;
  wage_ot: number | null;
  wage_gross: number | null;
  status: 'active' | 'inactive';
  employees_count: number;
}

const blank = () => ({ designation_name: '', industry_code: '', industry_name: '', group_name: '', department: '', skill_level: '', nature_of_work: '', statutory_category: '', wage_basic: '', wage_da: '', wage_allowance: '', wage_ot: '', status: 'active' });
const num = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0);
const rupees = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DesignationFormModal({ open, onClose, panel, row, lookups, employerId, onSaved }: {
  open: boolean;
  onClose: () => void;
  panel: 'admin' | 'employer';
  row: DesignationRow | null;
  lookups: DesignationLookups | null;
  /** Admin only: create the designation for this company instead of the shared master. */
  employerId?: number | null;
  onSaved: (id: number) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(row ? {
      designation_name: row.designation_name, industry_code: row.industry_code ?? '', industry_name: row.industry_name ?? '', group_name: row.group_name ?? '', department: row.department ?? '',
      skill_level: row.skill_level ?? '', nature_of_work: row.nature_of_work ?? '', statutory_category: row.statutory_category ?? '',
      wage_basic: row.wage_basic === null ? '' : String(row.wage_basic), wage_da: row.wage_da === null ? '' : String(row.wage_da), wage_allowance: row.wage_allowance === null ? '' : String(row.wage_allowance),
      wage_ot: row.wage_ot === null ? '' : String(row.wage_ot), status: row.status,
    } : blank());
  }, [open, row]);

  const set = (key: keyof ReturnType<typeof blank>) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const gross = num(form.wage_basic) + num(form.wage_da) + num(form.wage_allowance);
  const hasWage = [form.wage_basic, form.wage_da, form.wage_allowance].some((v) => v.trim() !== '');

  function pickIndustry(code: string) {
    const industry = lookups?.industries.find((i) => i.code === code);
    setForm((current) => ({ ...current, industry_code: code, industry_name: industry?.name ?? '' }));
  }

  async function save() {
    setBusy(true);
    setErrors({});
    const payload = { ...form, ...(panel === 'admin' && !row && employerId ? { employer_id: employerId } : {}) };
    const response = row ? await api.put<{ id: number }>(`/api/${panel}/designations/${row.id}`, payload) : await api.post<{ id: number }>(`/api/${panel}/designations`, payload);
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    toast.success(response.message);
    onSaved(response.data?.id ?? row?.id ?? 0);
    onClose();
  }

  const readOnly = row ? (panel === 'employer' && row.employer_id === null) : false;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={row ? 'Edit designation' : 'Add designation'}
      description={row ? undefined : panel === 'employer' ? 'It is added to your company\'s own list.' : employerId ? 'It is added for the selected company.' : 'It is added to the shared master.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>{!readOnly && <Button onClick={save} loading={busy}>{row ? 'Save changes' : 'Add designation'}</Button>}</>}>
      <fieldset disabled={readOnly} className="space-y-5">
        {readOnly && <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink-soft">This is part of the shared master, which only an administrator can change. Add your own designation if you need a different one.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Input label="Designation" requiredMark value={form.designation_name} onChange={set('designation_name')} error={errors.designation_name} placeholder="e.g. Sewing Machine Operator" /></div>
          <Select label="Industry" value={form.industry_code} onChange={pickIndustry} clearable searchable placeholder="Not tied to an industry" options={(lookups?.industries ?? []).map((i) => ({ value: i.code, label: `${i.code}. ${i.name}` }))} error={errors.industry_code} />
          <Input label="Group / function" value={form.group_name} onChange={set('group_name')} error={errors.group_name} placeholder="e.g. Production / Sewing / Cutting" />
          <Input label="Department" value={form.department} onChange={set('department')} error={errors.department} list="designation-departments" />
          <Select label="Skill level" value={form.skill_level} onChange={(v) => setForm((c) => ({ ...c, skill_level: v }))} clearable placeholder="Not set" options={(lookups?.levels ?? []).map((l) => ({ value: l, label: l }))} error={errors.skill_level}
            helper={row?.level_inferred ? 'Worked out from the name when the list was imported: please confirm.' : undefined} />
          <div className="md:col-span-2"><Input label="Nature of work" value={form.nature_of_work} onChange={set('nature_of_work')} error={errors.nature_of_work} /></div>
          <Select label="Statutory category" value={form.statutory_category} onChange={(v) => setForm((c) => ({ ...c, statutory_category: v }))} clearable placeholder="Not set" options={(lookups?.categories ?? []).map((c) => ({ value: c, label: c }))} error={errors.statutory_category}
            helper="Whether a statutory minimum wage notification applies. Skill category, management designation and statutory category are three different things." />
          <Select label="Status" value={form.status} onChange={(v) => setForm((c) => ({ ...c, status: v }))} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        <datalist id="designation-departments">{(lookups?.departments ?? []).map((d) => <option key={d} value={d} />)}</datalist>

        <div>
          <h3 className="text-sm font-semibold text-ink">Wage mapping (per day or month, as your notification states)</h3>
          <p className="mt-0.5 text-xs text-ink-muted">Optional. Fill it from the applicable wage notification. Line 5 is the sum of lines 1 to 3: it is not by itself the statutory minimum wage.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input label="Line 1 - Basic wage" type="number" min={0} value={form.wage_basic} onChange={set('wage_basic')} error={errors.wage_basic} />
            <Input label="Line 2 - VDA / DA" type="number" min={0} value={form.wage_da} onChange={set('wage_da')} error={errors.wage_da} />
            <Input label="Line 3 - Statutory allowances" type="number" min={0} value={form.wage_allowance} onChange={set('wage_allowance')} error={errors.wage_allowance} />
            <Input label="Line 4 - Overtime wages" type="number" min={0} value={form.wage_ot} onChange={set('wage_ot')} error={errors.wage_ot} helper="Rate or amount; paid on top" />
            <div><p className="label">Line 5 - Gross wages</p><p className="mt-1 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2 text-sm font-semibold tabular-nums">{hasWage ? rupees(gross) : '-'}</p></div>
          </div>
        </div>
      </fieldset>
    </Modal>
  );
}
