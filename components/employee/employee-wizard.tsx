'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DesignationPicker, type DesignationOption } from '@/components/designation/designation-picker';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, LinkButton } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { RecordGrid, RELATIONSHIP_OPTIONS, GENDER_OPTIONS, RECOMMENDATION_OPTIONS, type GridField } from './record-grid';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { formatCurrency } from '@/lib/utils/formatting';
import { EMPLOYEE_WIZARD_STEPS, type Employee } from '@/types/employee';
import {
  BLOOD_GROUPS, MARITAL_STATUSES, GENDERS, EMPLOYEE_CATEGORIES, STAYING_OPTIONS,
  WAGE_TYPES, WEEKLY_OFFS,
} from '@/lib/utils/constants';
import { INDIAN_STATES } from '@/types/employer';

type FormState = Record<string, string>;
type RowsState = Record<string, Record<string, string>[]>;

export interface WizardLookups {
  employers: { value: string; label: string; hint?: string }[];
  designations: string[];
  /** The Designation Master the picker offers (the shared list plus the company's own). */
  designationMaster?: DesignationOption[];
  checklistItems: { id: number; item_code: string; item_label: string; sort_order: number; is_mandatory: number }[];
  states: string[];
  /** Seeded payroll heads, so wage fields carry their statutory names. */
  wageHeads: { code: string; name: string; name_ta: string | null }[];
}

const EMPTY_FORM: FormState = {
  name: '', father_name: '', mother_name: '', spouse_name: '', sex: '', marital_status: '',
  religion: '', mother_tongue: '', blood_group: '', date_of_birth: '', languages_known: '',
  aadhaar_number: '', pan_number: '',

  present_address: '', permanent_address: '', is_permanent_same_as_present: 'false',
  state: '', pincode: '', telephone: '', mobile: '', email: '', native_place: '',
  staying_in: '', family_income_per_annum: '',

  employer_id: '', unit_id: '', department_id: '', employee_number: '', date_of_joining: '',
  date_of_confirmation: '', post_applied_for: '', department: '', designation: '', designation_id: '', nature_of_work: '',
  category: '', workforce_origin: '', employment_type: '', grade: '', skill_grade: '', place_of_work: '', shift_relay: '',
  working_hours_from: '', working_hours_to: '', interval_lunch_time: '', tea_break: '',
  weekly_off: '', probation_months: '', status: 'active',

  basic_salary: '', da: '', hra: '', ta: '', pa: '', ea: '', npba: '', other_allowances: '',
  wage_type: '', expected_salary: '',

  pf_number: '', pf_effective_date: '', uan: '', esi_number: '', esi_dispensary: '',
  mediclaim_number: '', previous_pf_account_number: '', previous_employer_exit_date: '',
  scheme_certificate_number: '', pension_payment_order_number: '', is_international_worker: 'false',
  country: '',

  bank_name: '', bank_account_number: '', ifsc_code: '', passport_number: '', passport_validity: '',

  create_login: 'false', login_username: '', login_email: '', login_mobile: '',
};

const WAGE_KEYS = ['basic_salary', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'] as const;

/** Columns that are numbers rather than text when the payload is assembled. */
const NUMERIC_KEYS = new Set([
  'unit_id', 'department_id', 'employer_id', 'designation_id', 'probation_months', 'family_income_per_annum', 'expected_salary',
  'basic_salary', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances',
]);

const BOOLEAN_KEYS = new Set(['is_permanent_same_as_present', 'is_international_worker', 'create_login']);

export function EmployeeWizard({
  mode, lookups, employee,
  basePath = '/api/admin', lockedEmployerId, employerName, redirectBase = '/admin/employees',
}: {
  mode: 'create' | 'edit';
  lookups: WizardLookups;
  employee?: Employee;
  /** `/api/admin` in the platform's register, `/api/employer` in an establishment's. */
  basePath?: string;
  /** Set by an establishment: it hires into itself, so there is no employer picker. */
  lockedEmployerId?: number;
  employerName?: string;
  /** Where the wizard goes after a successful create. */
  redirectBase?: string;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [step, setStep] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    ...seedForm(employee),
    ...(lockedEmployerId ? { employer_id: String(lockedEmployerId) } : {}),
  }));
  const [rows, setRows] = useState<RowsState>({ nominees: [], qualifications: [], experience: [], dependents: [], references: [] });
  const [interview, setInterview] = useState<FormState>({});
  const [checklist, setChecklist] = useState<Record<string, { is_checked: boolean; remarks: string }>>({});
  const [units, setUnits] = useState<{ value: string; label: string }[]>([]);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string; email: string } | null>(null);

  const gross = useMemo(
    () => WAGE_KEYS.reduce((total, key) => total + Number(form[key] || 0), 0),
    [form]
  );

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const setSelect = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const setBool = (key: string) => (checked: boolean) => setForm((current) => ({ ...current, [key]: String(checked) }));

  /** Choosing a designation links it and fills what the form left blank: department text, nature of work, skill grade, and the basic and DA lines from its wage mapping. */
  const pickDesignation = useCallback((option: DesignationOption | null) => {
    setForm((current) => {
      if (!option) return { ...current, designation_id: '', designation: '' };
      const next: FormState = { ...current, designation_id: String(option.id), designation: option.name };
      if (!next.department && !next.department_id && option.department) next.department = option.department;
      if (!next.nature_of_work && option.nature) next.nature_of_work = option.nature;
      if (!next.skill_grade && option.level) next.skill_grade = option.level;
      if (!next.basic_salary && option.basic !== null) next.basic_salary = String(option.basic);
      if (!next.da && option.da !== null) next.da = String(option.da);
      return next;
    });
  }, []);

  // Units and departments follow the selected employer.
  useEffect(() => {
    const employerId = lockedEmployerId ?? form.employer_id;
    if (!employerId) { setUnits([]); setDepartments([]); return; }
    let cancelled = false;
    // An establishment's own panel serves its units and departments as first-class
    // registers; the platform's register reads them per employer.
    const own = Boolean(lockedEmployerId) || basePath === '/api/employer';
    (async () => {
      const [unitsResult, departmentsResult] = await Promise.all([
        own
          ? api.get<{ id: number; unit_name: string }[]>(`${basePath}/units`)
          : api.get<{ id: number; unit_name: string }[]>(`${basePath}/employers/${employerId}/units`),
        own
          ? api.get<{ id: number; department_name: string }[]>(`${basePath}/departments`)
          : api.get<{ id: number; department_name: string }[]>(`${basePath}/employers/${employerId}/departments`),
      ]);
      if (cancelled) return;
      setUnits((unitsResult.data ?? []).map((unit) => ({ value: String(unit.id), label: unit.unit_name })));
      setDepartments((departmentsResult.data ?? []).map((dept) => ({ value: String(dept.id), label: dept.department_name })));
    })();
    return () => { cancelled = true; };
  }, [form.employer_id, lockedEmployerId, basePath]);

  // Load existing child rows and checklist state when editing.
  useEffect(() => {
    if (mode !== 'edit' || !employee) return;
    let cancelled = false;
    (async () => {
      const [detail, checklistRows] = await Promise.all([
        api.get<{ nominees: unknown[]; qualifications: unknown[]; experience: unknown[]; dependents: unknown[]; references: unknown[]; interview: Record<string, unknown> | null }>(
          `${basePath}/employees/${employee.id}`
        ),
        api.get<{ item_id: number; is_checked: number; remarks: string | null }[]>(`${basePath}/employees/${employee.id}/checklist`),
      ]);
      if (cancelled) return;

      const detailData = detail.raw as {
        nominees?: Employee['id'] extends never ? never : Record<string, unknown>[];
        qualifications?: Record<string, unknown>[];
        experience?: Record<string, unknown>[];
        dependents?: Record<string, unknown>[];
        references?: Record<string, unknown>[];
        interview?: Record<string, unknown> | null;
      };
      const toRows = (list: Record<string, unknown>[] | undefined) =>
        (list ?? []).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])));

      setRows({
        nominees: toRows(detailData?.nominees),
        qualifications: toRows(detailData?.qualifications),
        experience: toRows(detailData?.experience),
        dependents: toRows(detailData?.dependents),
        references: toRows(detailData?.references),
      });

      if (detailData?.interview) {
        setInterview(Object.fromEntries(
          Object.entries(detailData.interview).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])
        ));
      }
      if (Array.isArray(checklistRows.data)) {
        setChecklist(Object.fromEntries(
          checklistRows.data.map((row) => [String(row.item_id), { is_checked: Boolean(row.is_checked), remarks: row.remarks ?? '' }])
        ));
      }
    })();
    return () => { cancelled = true; };
  }, [mode, employee]);

  /** Client-side gate before advancing a step — the server validates again. */
  function validateStep(index: number): Record<string, string> {
    const found: Record<string, string> = {};
    if (index === 0 && form.name.trim().length < 2) found.name = 'Employee name is required';
    if (index === 2 && !form.employer_id) found.employer_id = 'Select the employer this employee belongs to';
    if (index === 2 && !form.date_of_joining) found.date_of_joining = 'Date of joining is required';
    if (index === 5 && form.bank_account_number && !form.ifsc_code) found.ifsc_code = 'IFSC is required when a bank account is entered';
    if (index === 13 && form.create_login === 'true' && !form.login_email) found.login_email = 'An email address is required to create the login';
    return found;
  }

  function next() {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length) {
      errorToast('Please complete this step', Object.values(found)[0]);
      return;
    }
    setStep((current) => Math.min(current + 1, EMPLOYEE_WIZARD_STEPS.length - 1));
  }

  function payload() {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      if (BOOLEAN_KEYS.has(key)) { output[key] = value === 'true'; continue; }
      if (NUMERIC_KEYS.has(key)) { output[key] = value === '' ? null : Number(value); continue; }
      output[key] = value;
    }
    output.gross_salary = gross;

    output.nominees = rows.nominees
      .filter((row) => String(row.nominee_name ?? '').trim())
      .map((row) => ({
        ...row,
        share_percentage: row.share_percentage === '' ? 100 : Number(row.share_percentage),
        is_minor: row.is_minor === 'true',
      }));
    output.qualifications = rows.qualifications.filter((row) => String(row.qualification ?? '').trim());
    output.experience = rows.experience.filter((row) => String(row.company_name ?? '').trim());
    output.dependents = rows.dependents.filter((row) => String(row.dependent_name ?? '').trim());
    output.references = rows.references.filter((row) => String(row.reference_name ?? '').trim());
    output.interview = Object.values(interview).some((value) => value) ? interview : null;
    output.checklist = lookups.checklistItems.map((item) => ({
      item_id: item.id,
      is_checked: checklist[String(item.id)]?.is_checked ?? false,
      remarks: checklist[String(item.id)]?.remarks ?? '',
    }));
    return output;
  }

  /** Saves the chosen photo and signature in the vault and points the employee record at them. */
  async function uploadMedia(employeeId: number): Promise<boolean> {
    const links: Record<string, string> = {};
    for (const [field, file, category] of [['photo', photoFile, 'Employee photo'], ['signature', signatureFile, 'Employee signature']] as const) {
      if (!file) continue;
      const body = new FormData();
      body.append('files', file); body.append('entityType', 'EMPLOYEE'); body.append('entityId', String(employeeId)); body.append('category', category);
      const uploaded = await apiFetch('/api/files/upload', { method: 'POST', body });
      const url = (uploaded.raw as { files?: { url?: string }[] } | undefined)?.files?.[0]?.url;
      if (!uploaded.ok || !url) { errorToast(`Could not upload the ${field}`, uploaded.message); return false; }
      links[field] = url;
    }
    if (!Object.keys(links).length) return true;
    const linked = await api.patch(`${basePath}/employees/${employeeId}`, links);
    if (!linked.ok) { errorToast('Could not save the photo and signature', linked.message); return false; }
    return true;
  }

  async function submit() {
    // Validate every step that has a gate before sending.
    for (const index of [0, 2, 5, 13]) {
      const found = validateStep(index);
      if (Object.keys(found).length) {
        setStep(index);
        setErrors(found);
        errorToast('Please complete this step', Object.values(found)[0]);
        return;
      }
    }

    setSaving(true);
    const body = payload();
    const result = mode === 'create'
      ? await api.post<{ employeeId: number; employeeNumber: string; credentials?: typeof credentials; warnings?: string[] }>(`${basePath}/employees`, body)
      : await api.put<{ employee: Employee }>(`${basePath}/employees/${employee?.id}`, body);
    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save employee', result.message);
      return;
    }

    if (mode === 'create') {
      const created = result.raw as { employeeId: number; employeeNumber: string; credentials?: typeof credentials; warnings?: string[] };
      await uploadMedia(created.employeeId);
      if (created.credentials) {
        setCredentials(created.credentials);
        return;
      }
      success('Employee registered', `${form.name} (${created.employeeNumber}) has been added.`);
      router.push(`${redirectBase}/${created.employeeId}`);
    } else {
      if (employee?.id) await uploadMedia(employee.id);
      success('Employee updated', `${form.name}'s record has been updated.`);
      router.refresh();
    }
  }

  const current = EMPLOYEE_WIZARD_STEPS[step];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      {/* Step rail */}
      <Card padded={false} className="h-fit lg:sticky lg:top-20">
        <CardHeader title="Onboarding steps" description={`Step ${step + 1} of ${EMPLOYEE_WIZARD_STEPS.length}`} />
        <ol className="max-h-[70vh] overflow-y-auto px-2 py-2">
          {EMPLOYEE_WIZARD_STEPS.map((entry, index) => {
            const isDone = index < step;
            const isCurrent = index === step;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
                    isCurrent ? 'bg-brand-50' : 'hover:bg-surface-muted'
                  }`}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isCurrent ? 'bg-brand-500 text-white' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-muted text-ink-muted'
                  }`}>
                    {isDone ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M20 6 9 17l-5-5" /></svg> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-medium ${isCurrent ? 'text-brand-700' : 'text-ink'}`}>{entry.title}</span>
                    <span className="block text-xs text-ink-muted">{entry.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="space-y-6">
        <Card padded={false}>
          <CardHeader title={current.title} description={current.description} />
          <CardBody className="space-y-5">
            {step === 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2 xl:col-span-3">
                  <MediaPick label="Employee photo" helper="A clear passport-size photo (JPG or PNG)." file={photoFile} current={employee?.photo ?? null} onPick={setPhotoFile} camera />
                  <MediaPick label="Employee signature" helper="The signature on white paper, photographed or scanned." file={signatureFile} current={(employee as unknown as { signature?: string | null } | undefined)?.signature ?? null} onPick={setSignatureFile} />
                </div>
                <Input label="Full Name" requiredMark value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Murugan Selvam" />
                <Input label="Father / Husband Name" value={form.father_name} onChange={set('father_name')} error={errors.father_name} />
                <Input label="Mother Name" value={form.mother_name} onChange={set('mother_name')} error={errors.mother_name} />
                <Input label="Spouse Name" value={form.spouse_name} onChange={set('spouse_name')} error={errors.spouse_name} />
                <Select label="Sex" value={form.sex} onChange={setSelect('sex')} placeholder="Select" options={GENDERS.map((v) => ({ value: v, label: v }))} />
                <Select label="Marital Status" value={form.marital_status} onChange={setSelect('marital_status')} placeholder="Select" options={MARITAL_STATUSES.map((v) => ({ value: v, label: v }))} />
                <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} error={errors.date_of_birth} />
                <Select label="Blood Group" value={form.blood_group} onChange={setSelect('blood_group')} placeholder="Select" options={BLOOD_GROUPS.map((v) => ({ value: v, label: v }))} />
                <Input label="Religion" value={form.religion} onChange={set('religion')} error={errors.religion} />
                <Input label="Mother Tongue" value={form.mother_tongue} onChange={set('mother_tongue')} error={errors.mother_tongue} placeholder="e.g. Tamil" />
                <Input label="Languages Known" value={form.languages_known} onChange={set('languages_known')} error={errors.languages_known} placeholder="Tamil, English, Hindi" />
                <Input label="Aadhaar Number" value={form.aadhaar_number} onChange={set('aadhaar_number')} error={errors.aadhaar_number} placeholder="12 digits, no spaces" maxLength={12} />
                <Input label="PAN Number" value={form.pan_number} onChange={set('pan_number')} error={errors.pan_number} placeholder="ABCDE1234F" />
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Textarea label="Present Address" rows={3} value={form.present_address} onChange={set('present_address')} error={errors.present_address} placeholder="Door no., street, area, town" />
                </div>
                <div className="md:col-span-2">
                  <Checkbox label="Permanent address is the same as the present address" checked={form.is_permanent_same_as_present === 'true'} onChange={(event) => setBool('is_permanent_same_as_present')((event.target as HTMLInputElement).checked)} />
                </div>
                {form.is_permanent_same_as_present !== 'true' && (
                  <div className="md:col-span-2">
                    <Textarea label="Permanent Address" rows={3} value={form.permanent_address} onChange={set('permanent_address')} error={errors.permanent_address} />
                  </div>
                )}
                <Select label="State" value={form.state} onChange={setSelect('state')} placeholder="Select state" searchable
                  options={(lookups.states.length ? lookups.states : (INDIAN_STATES as unknown as string[])).map((value) => ({ value, label: value }))} />
                <Input label="Pincode" value={form.pincode} onChange={set('pincode')} error={errors.pincode} maxLength={6} placeholder="641001" />
                <Input label="Mobile" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="+91 98xxx xxxxx" />
                <Input label="Telephone" value={form.telephone} onChange={set('telephone')} error={errors.telephone} />
                <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
                <Input label="Native Place" value={form.native_place} onChange={set('native_place')} error={errors.native_place} />
                <Select label="Staying In" value={form.staying_in} onChange={setSelect('staying_in')} placeholder="Select" options={STAYING_OPTIONS.map((v) => ({ value: v, label: v }))} />
                <Input label="Family Income Per Annum" type="number" value={form.family_income_per_annum} onChange={set('family_income_per_annum')} error={errors.family_income_per_annum} />
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Select label="Employer" required value={form.employer_id} onChange={setSelect('employer_id')} error={errors.employer_id}
                  placeholder="Select employer" searchable disabled={Boolean(lockedEmployerId)}
                  options={lockedEmployerId ? [{ value: String(lockedEmployerId), label: employerName ?? 'Your establishment' }] : lookups.employers} />
                <Select label="Unit" value={form.unit_id} onChange={setSelect('unit_id')} placeholder={form.employer_id ? 'Select unit' : 'Select an employer first'} clearable options={units} />
                <Select label="Department" value={form.department_id} onChange={setSelect('department_id')} placeholder={form.employer_id ? 'Select department' : 'Select an employer first'} clearable options={departments} />
                <Input label="Employee Number" value={form.employee_number} onChange={set('employee_number')} error={errors.employee_number}
                  helper="Leave blank to auto-generate (EMP-YYYY-000001)." placeholder="Auto-generated" />
                <Input label="Date of Joining" requiredMark type="date" value={form.date_of_joining} onChange={set('date_of_joining')} error={errors.date_of_joining} />
                <Input label="Date of Confirmation" type="date" value={form.date_of_confirmation} onChange={set('date_of_confirmation')} error={errors.date_of_confirmation} />
                <Input label="Post Applied For" value={form.post_applied_for} onChange={set('post_applied_for')} error={errors.post_applied_for} />
                <DesignationPicker options={lookups.designationMaster ?? []} employerId={lockedEmployerId ? String(lockedEmployerId) : form.employer_id} panel={basePath.includes('employer') ? 'employer' : 'admin'}
                  valueId={form.designation_id} valueText={form.designation} error={errors.designation ?? errors.designation_id} onPick={pickDesignation} />
                <Input label="Department (free text)" value={form.department} onChange={set('department')} error={errors.department} helper="Used when the department is not in the master list." />
                <Input label="Nature of Work" value={form.nature_of_work} onChange={set('nature_of_work')} error={errors.nature_of_work} />
                <Select label="Category" value={form.category} onChange={setSelect('category')} placeholder="Select" options={EMPLOYEE_CATEGORIES.map((v) => ({ value: v, label: v }))} />
                <Select label="Employee status" value={form.workforce_origin} onChange={setSelect('workforce_origin')} placeholder="Select" options={['State local', 'Migrant'].map((v) => ({ value: v, label: `${v} employee` }))} />
                <Select label="Working status" value={form.employment_type} onChange={setSelect('employment_type')} placeholder="Select" options={['Permanent', 'Temporary', 'Contract'].map((v) => ({ value: v, label: `${v} employee` }))} />
                <Input label="Grade" value={form.grade} onChange={set('grade')} error={errors.grade} />
                <Input label="Skill Grade" value={form.skill_grade} onChange={set('skill_grade')} error={errors.skill_grade} />
                <Input label="Place of Work" value={form.place_of_work} onChange={set('place_of_work')} error={errors.place_of_work} />
                <Input label="Shift / Relay" value={form.shift_relay} onChange={set('shift_relay')} error={errors.shift_relay} placeholder="e.g. A Shift (6am–2pm)" />
                <Input label="Working Hours From" type="time" value={form.working_hours_from} onChange={set('working_hours_from')} error={errors.working_hours_from} />
                <Input label="Working Hours To" type="time" value={form.working_hours_to} onChange={set('working_hours_to')} error={errors.working_hours_to} />
                <Input label="Lunch Interval" value={form.interval_lunch_time} onChange={set('interval_lunch_time')} error={errors.interval_lunch_time} placeholder="1:00 pm – 1:30 pm" />
                <Input label="Tea Break" value={form.tea_break} onChange={set('tea_break')} error={errors.tea_break} placeholder="4:00 pm – 4:15 pm" />
                <Select label="Weekly Off" value={form.weekly_off} onChange={setSelect('weekly_off')} placeholder="Select" options={WEEKLY_OFFS.map((v) => ({ value: v, label: v }))} />
                <Input label="Probation (months)" type="number" min={0} max={36} value={form.probation_months} onChange={set('probation_months')} error={errors.probation_months} />
                <Select label="Status" value={form.status} onChange={setSelect('status')}
                  options={['active', 'inactive', 'resigned', 'terminated', 'retired', 'absconding'].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {WAGE_KEYS.map((key) => {
                    const head = lookups.wageHeads.find((entry) => entry.code === key.toUpperCase());
                    return (
                      <Input
                        key={key}
                        label={head?.name ?? key.toUpperCase()}
                        type="number" min={0} value={form[key]} onChange={set(key)} error={errors[key]} placeholder="0.00"
                        helper={head?.name_ta ?? undefined}
                      />
                    );
                  })}
                  <Select label="Wage Type" value={form.wage_type} onChange={setSelect('wage_type')} placeholder="Select" options={WAGE_TYPES.map((v) => ({ value: v, label: v }))} />
                  <Input label="Expected Salary" type="number" min={0} value={form.expected_salary} onChange={set('expected_salary')} error={errors.expected_salary} />
                </div>
                <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-brand-700">Gross Salary (calculated)</p>
                  <p className="text-2xl font-bold text-brand-800">{formatCurrency(gross)}</p>
                  <p className="mt-1 text-xs text-brand-700">
                    Sum of basic, DA, HRA, TA, PA, EA, NPBA and other allowances. Stored on the employee record and used
                    as the starting point for the salary structure.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Input label="PF Number" value={form.pf_number} onChange={set('pf_number')} error={errors.pf_number} placeholder="TN/COI/12345/000/0001234" />
                <Input label="PF Effective Date" type="date" value={form.pf_effective_date} onChange={set('pf_effective_date')} error={errors.pf_effective_date} />
                <Input label="UAN" value={form.uan} onChange={set('uan')} error={errors.uan} placeholder="12 digits" maxLength={12} />
                <Input label="ESI Number" value={form.esi_number} onChange={set('esi_number')} error={errors.esi_number} placeholder="17-digit IP number" />
                <Input label="ESI Dispensary" value={form.esi_dispensary} onChange={set('esi_dispensary')} error={errors.esi_dispensary} />
                <Input label="Mediclaim Number" value={form.mediclaim_number} onChange={set('mediclaim_number')} error={errors.mediclaim_number} />
                <Input label="Previous PF Account Number" value={form.previous_pf_account_number} onChange={set('previous_pf_account_number')} error={errors.previous_pf_account_number} />
                <Input label="Previous Employer Exit Date" type="date" value={form.previous_employer_exit_date} onChange={set('previous_employer_exit_date')} error={errors.previous_employer_exit_date} />
                <Input label="Scheme Certificate Number" value={form.scheme_certificate_number} onChange={set('scheme_certificate_number')} error={errors.scheme_certificate_number} />
                <Input label="Pension Payment Order Number" value={form.pension_payment_order_number} onChange={set('pension_payment_order_number')} error={errors.pension_payment_order_number} />
                <Checkbox label="International worker (EPF Scheme, para 83)" checked={form.is_international_worker === 'true'} onChange={(event) => setBool('is_international_worker')((event.target as HTMLInputElement).checked)} />
                {form.is_international_worker === 'true' && (
                  <Input label="Country" value={form.country} onChange={set('country')} error={errors.country} />
                )}
              </div>
            )}

            {step === 5 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Input label="Bank Name" value={form.bank_name} onChange={set('bank_name')} error={errors.bank_name} placeholder="e.g. Indian Bank" />
                <Input label="Account Number" value={form.bank_account_number} onChange={set('bank_account_number')} error={errors.bank_account_number} />
                <Input label="IFSC Code" value={form.ifsc_code} onChange={set('ifsc_code')} error={errors.ifsc_code} placeholder="IDIB000C123" />
                <Input label="Passport Number" value={form.passport_number} onChange={set('passport_number')} error={errors.passport_number} />
                <Input label="Passport Validity" type="date" value={form.passport_validity} onChange={set('passport_validity')} error={errors.passport_validity} />
              </div>
            )}

            {step === 6 && (
              <RecordGrid
                title="EPS / EPF Form 2 and Gratuity Form F nominees"
                description="Shares across nominees of the same form type should total 100%."
                emptyText="No nominees recorded yet."
                fields={[
                  { key: 'form_type', label: 'Form', type: 'select', options: [
                    { value: 'EPF_FORM_2', label: 'EPF Form 2' }, { value: 'GRATUITY_FORM_F', label: 'Gratuity Form F' },
                  ], width: '150px' },
                  { key: 'nominee_name', label: 'Nominee Name', required: true, width: '180px' },
                  { key: 'relationship', label: 'Relationship', type: 'select', options: RELATIONSHIP_OPTIONS, width: '140px' },
                  { key: 'date_of_birth', label: 'Date of Birth', type: 'date', width: '150px' },
                  { key: 'share_percentage', label: 'Share %', type: 'number', width: '100px' },
                  { key: 'guardian_name', label: 'Guardian (if minor)', width: '170px' },
                  { key: 'address', label: 'Address', width: '220px' },
                ]}
                rows={rows.nominees}
                onChange={(next) => setRows((current) => ({ ...current, nominees: next }))}
              />
            )}

            {step === 7 && (
              <RecordGrid
                title="Educational qualifications"
                emptyText="No qualifications recorded yet."
                fields={[
                  { key: 'qualification', label: 'Qualification', required: true, width: '160px' },
                  { key: 'specialization', label: 'Specialization', width: '150px' },
                  { key: 'institution', label: 'Institution', width: '190px' },
                  { key: 'board_university', label: 'Board / University', width: '180px' },
                  { key: 'year_of_passing', label: 'Year', type: 'number', width: '90px' },
                  { key: 'percentage', label: 'Percentage', type: 'number', width: '110px' },
                  { key: 'grade', label: 'Grade', width: '90px' },
                ]}
                rows={rows.qualifications}
                onChange={(next) => setRows((current) => ({ ...current, qualifications: next }))}
              />
            )}

            {step === 8 && (
              <RecordGrid
                title="Previous employment"
                emptyText="No previous employment recorded yet."
                fields={[
                  { key: 'company_name', label: 'Company', required: true, width: '190px' },
                  { key: 'designation', label: 'Designation', width: '150px' },
                  { key: 'department', label: 'Department', width: '140px' },
                  { key: 'date_from', label: 'From', type: 'date', width: '150px' },
                  { key: 'date_to', label: 'To', type: 'date', width: '150px' },
                  { key: 'total_period', label: 'Total Period', width: '120px', placeholder: '2 yrs 3 mo' },
                  { key: 'last_salary', label: 'Last Salary', type: 'number', width: '120px' },
                  { key: 'reason_for_leaving', label: 'Reason for Leaving', width: '180px' },
                ]}
                rows={rows.experience}
                onChange={(next) => setRows((current) => ({ ...current, experience: next }))}
              />
            )}

            {step === 9 && (
              <RecordGrid
                title="Dependents"
                emptyText="No dependents recorded yet."
                fields={[
                  { key: 'dependent_name', label: 'Name', required: true, width: '180px' },
                  { key: 'relationship', label: 'Relationship', type: 'select', options: RELATIONSHIP_OPTIONS, width: '140px' },
                  { key: 'date_of_birth', label: 'Date of Birth', type: 'date', width: '150px' },
                  { key: 'sex', label: 'Sex', type: 'select', options: GENDER_OPTIONS, width: '120px' },
                  { key: 'occupation', label: 'Occupation', width: '150px' },
                  { key: 'aadhaar_number', label: 'Aadhaar', width: '150px' },
                ]}
                rows={rows.dependents}
                onChange={(next) => setRows((current) => ({ ...current, dependents: next }))}
              />
            )}

            {step === 10 && (
              <RecordGrid
                title="References"
                description="Names the establishment can contact for verification."
                emptyText="No references recorded yet."
                fields={[
                  { key: 'reference_name', label: 'Name', required: true, width: '180px' },
                  { key: 'designation', label: 'Designation', width: '150px' },
                  { key: 'organization', label: 'Organisation', width: '180px' },
                  { key: 'mobile', label: 'Mobile', width: '140px' },
                  { key: 'email', label: 'Email', type: 'email', width: '190px' },
                  { key: 'relationship', label: 'Relationship', width: '140px' },
                  { key: 'address', label: 'Address', width: '220px' },
                ]}
                rows={rows.references}
                onChange={(next) => setRows((current) => ({ ...current, references: next }))}
              />
            )}

            {step === 11 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Input label="Interview Date" type="date" value={interview.interview_date ?? ''} onChange={(e) => setInterview((c) => ({ ...c, interview_date: e.target.value }))} />
                <Input label="Interviewer Name" value={interview.interviewer_name ?? ''} onChange={(e) => setInterview((c) => ({ ...c, interviewer_name: e.target.value }))} />
                <Input label="Position Applied For" value={interview.position_applied ?? form.post_applied_for} onChange={(e) => setInterview((c) => ({ ...c, position_applied: e.target.value }))} />
                <Select label="Recommendation" value={interview.recommendation ?? ''} placeholder="Select"
                  onChange={(value) => setInterview((c) => ({ ...c, recommendation: value }))}
                  options={RECOMMENDATION_OPTIONS} />
                {(['qualification_rating', 'experience_rating', 'communication_rating', 'technical_rating', 'attitude_rating', 'overall_rating'] as const).map((key) => (
                  <Select key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
                    value={interview[key] ?? ''} placeholder="Rate 1–5" clearable
                    onChange={(value) => setInterview((c) => ({ ...c, [key]: value }))}
                    options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} — ${['Poor', 'Below Average', 'Average', 'Good', 'Excellent'][n - 1]}` }))} />
                ))}
                <div className="md:col-span-2 xl:col-span-3">
                  <Textarea label="Interviewer Remarks" rows={3} value={interview.remarks ?? ''} onChange={(e) => setInterview((c) => ({ ...c, remarks: e.target.value }))} />
                </div>
              </div>
            )}

            {step === 12 && (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Tick the items held in this employee&rsquo;s personal file. The same 16 items are used across every
                  establishment, matching the personnel-file requirements under the state rules.
                </p>
                <div className="divide-y divide-line rounded-lg border border-line">
                  {lookups.checklistItems.map((item) => {
                    const entry = checklist[String(item.id)] ?? { is_checked: false, remarks: '' };
                    return (
                      <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <Checkbox
                          label=""
                          checked={entry.is_checked}
                          onChange={(event) =>
                            setChecklist((current) => ({
                              ...current,
                              [String(item.id)]: { ...entry, is_checked: (event.target as HTMLInputElement).checked },
                            }))
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-ink">
                            {item.item_label}
                            {item.is_mandatory ? <span className="ml-1 text-xs text-red-500">*</span> : null}
                          </span>
                          <span className="block text-xs text-ink-muted">{item.item_code}</span>
                        </span>
                        <input
                          type="text" value={entry.remarks} placeholder="Remarks (optional)" aria-label={`Remarks for ${item.item_label}`}
                          onChange={(event) =>
                            setChecklist((current) => ({
                              ...current,
                              [String(item.id)]: { ...entry, remarks: event.target.value },
                            }))
                          }
                          className="focus-ring w-full max-w-xs rounded-lg border border-line px-3 py-1.5 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 13 && (
              <div className="space-y-5">
                <Checkbox
                  label="Create a self-service login for this employee"
                  checked={form.create_login === 'true'}
                  onChange={(event) => {
                    const checked = (event.target as HTMLInputElement).checked;
                    setBool('create_login')(checked);
                    if (checked) {
                      setForm((current) => ({
                        ...current,
                        login_email: current.login_email || current.email,
                        login_mobile: current.login_mobile || current.mobile,
                        login_username: current.login_username || slugUsername(current.name),
                      }));
                    }
                  }}
                />
                {form.create_login === 'true' && (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Input label="Username" requiredMark value={form.login_username} onChange={set('login_username')} error={errors.login_username} />
                      <Input label="Login Email" type="email" requiredMark value={form.login_email} onChange={set('login_email')} error={errors.login_email} />
                      <Input label="Mobile" value={form.login_mobile} onChange={set('login_mobile')} error={errors.login_mobile} />
                    </div>
                    <p className="rounded-lg bg-surface-muted px-4 py-3 text-xs leading-relaxed text-ink-muted">
                      A temporary password is generated and emailed to the address above together with an activation
                      link. The employee is asked to set their own password at first sign-in, and can then view their
                      profile, attendance, leave and payslips.
                    </p>
                  </>
                )}

                <div className="rounded-lg border border-line px-4 py-3">
                  <p className="text-sm font-medium text-ink">Summary</p>
                  <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <Summary label="Employee" value={form.name || '—'} />
                    <Summary label="Employer" value={employerName ?? lookups.employers.find((e) => e.value === form.employer_id)?.label ?? '—'} />
                    <Summary label="Date of joining" value={form.date_of_joining || '—'} />
                    <Summary label="Gross salary" value={formatCurrency(gross)} />
                    <Summary label="Qualifications" value={String(rows.qualifications.length)} />
                    <Summary label="Dependents" value={String(rows.dependents.length)} />
                    <Summary label="Checklist completed" value={`${Object.values(checklist).filter((e) => e.is_checked).length} / ${lookups.checklistItems.length}`} />
                    <Summary label="Portal login" value={form.create_login === 'true' ? 'Will be created' : 'Not created'} />
                  </dl>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep((c) => Math.max(c - 1, 0))} disabled={step === 0}>
              Previous
            </Button>
            {step < EMPLOYEE_WIZARD_STEPS.length - 1 ? (
              <Button type="button" onClick={next}>Next Step</Button>
            ) : (
              <Button type="button" onClick={submit} loading={saving}>
                {mode === 'create' ? 'Register Employee' : 'Save Changes'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted">Step {step + 1} of {EMPLOYEE_WIZARD_STEPS.length}</span>
            <LinkButton href={mode === 'edit' && employee ? `/admin/employees/${employee.id}` : '/admin/employees'} variant="ghost" size="sm">
              Cancel
            </LinkButton>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(credentials)}
        onClose={() => credentials && finishAfterCredentials()}
        title="Employee registered — portal login created"
        description="These credentials are shown once. The same details have been emailed to the employee."
        size="md"
        footer={<Button onClick={finishAfterCredentials}>Continue to Employee Record</Button>}
      >
        {credentials && (
          <div className="space-y-3">
            <Credential label="Username" value={credentials.username} />
            <Credential label="Temporary password" value={credentials.temporaryPassword} />
            <Credential label="Emailed to" value={credentials.email} />
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              The employee must change this password at first sign-in. Email delivery is logged under Admin →
              Email Logs; if SMTP is not yet configured the message is stored there with provider “simulated”.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );

  function finishAfterCredentials() {
    const employeeId = (window as unknown as { __lastEmployeeId?: number }).__lastEmployeeId;
    setCredentials(null);
    router.push(employeeId ? `/admin/employees/${employeeId}` : '/admin/employees');
  }
}

function seedForm(employee?: Employee): FormState {
  if (!employee) return { ...EMPTY_FORM };
  const seeded: FormState = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    const value = (employee as unknown as Record<string, unknown>)[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'boolean') seeded[key] = String(value);
    else seeded[key] = String(value);
  }
  seeded.create_login = 'false';
  seeded.login_username = '';
  seeded.login_email = '';
  seeded.login_mobile = '';
  return seeded;
}

function slugUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.').slice(0, 50);
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <code className="text-sm font-semibold text-ink">{value}</code>
    </div>
  );
}

export type { GridField };

/** A picture picker with a preview (the file chosen now, or the one already saved). */
function MediaPick({ label, helper, file, current, onPick, camera }: { label: string; helper: string; file: File | null; current: string | null; onPick: (file: File | null) => void; camera?: boolean }) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview ?? current;
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-4 rounded-lg border border-line p-3">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted text-xs text-ink-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={label} className="h-full w-full object-cover" />
          ) : 'None'}
        </span>
        <div className="min-w-0 space-y-1">
          <input type="file" accept="image/*" {...(camera ? { capture: 'user' as const } : {})} aria-label={label} onChange={(event) => onPick(event.target.files?.[0] ?? null)} className="block w-full text-sm" />
          <p className="text-xs text-ink-muted">{helper}</p>
          {file && <button type="button" onClick={() => onPick(null)} className="text-xs font-semibold text-red-600 hover:underline">Remove the chosen file</button>}
        </div>
      </div>
    </div>
  );
}
