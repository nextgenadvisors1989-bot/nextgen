'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, LinkButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MultiFileUpload } from '@/components/ui/multi-file-upload';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { INDIAN_STATES } from '@/types/employer';
import { AUDITOR_SPECIALIZATIONS, type Auditor } from '@/types/auditor';

type FormState = Record<string, string>;

const EMPTY: FormState = {
  name: '', email: '', mobile: '', alternate_mobile: '',
  auditor_type_id: '', role_title: '', specialization: '', qualification: '', experience_years: '',
  address: '', city: '', state: '', pincode: '',
  pan_number: '', aadhaar_number: '', bank_name: '', bank_account_number: '', ifsc_code: '',
  date_of_joining: '', assigned_employer_id: '', max_concurrent_audits: '5', status: 'active',
  portal_user_name: '', portal_user_email: '', portal_user_mobile: '',
};

export interface AuditorFormLookups {
  auditorTypes: { id: number; name: string; code: string; specialization: string | null }[];
  employers: { id: number; company_name: string; employer_code: string }[];
}

/**
 * Auditor create / edit form. One component serves both routes so the field set,
 * validation surface and API contract can never drift apart. The auditor code is
 * generated server-side as `AUDT/<year>/<serial>` and shown once the record exists.
 */
export function AuditorForm({
  mode, auditor, lookups, canProvisionLogin = true,
}: {
  mode: 'create' | 'edit';
  auditor?: Auditor;
  lookups: AuditorFormLookups;
  canProvisionLogin?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'edit' && auditor) {
      const seeded: FormState = { ...EMPTY };
      for (const key of Object.keys(EMPTY)) {
        const value = (auditor as unknown as Record<string, unknown>)[key];
        seeded[key] = value === null || value === undefined ? '' : String(value);
      }
      seeded.portal_user_name = '';
      seeded.portal_user_email = '';
      seeded.portal_user_mobile = '';
      seeded.photo = '';
      return seeded;
    }
    return EMPTY;
  });
  const [createPortalUser, setCreatePortalUser] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photoFileId, setPhotoFileId] = useState<number | null>(null);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const setSelect = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** The photo is uploaded to the vault first, then its id travels with the form. */
  const setPhoto = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, [key]: String(reader.result ?? '') }));
    reader.readAsDataURL(file);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload: Record<string, unknown> = { ...form };
    for (const key of ['experience_years', 'max_concurrent_audits'] as const) {
      payload[key] = form[key] === '' ? null : Number(form[key]);
    }
    for (const key of ['auditor_type_id', 'assigned_employer_id'] as const) {
      payload[key] = form[key] === '' ? null : Number(form[key]);
    }
    payload.create_portal_user = createPortalUser;

    const result = mode === 'create'
      ? await api.post<{ auditorId: number; auditorCode: string; credentials?: { username: string; temporaryPassword: string } }>(
          '/api/admin/auditors', payload
        )
      : await api.put<{ auditor: Auditor }>(`/api/admin/auditors/${auditor?.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save auditor', result.message);
      return;
    }

    if (mode === 'create') {
      const created = result.raw as { auditorId: number; auditorCode: string; credentials?: { username: string } };
      success('Auditor registered', `${form.name} was registered as ${created.auditorCode}.`);
      if (created.credentials) {
        success('Auditor portal login created', `Username ${created.credentials.username} — a temporary password was emailed to ${form.portal_user_email}.`);
      }
      router.push(`/admin/auditors/${created.auditorId}`);
    } else {
      success('Auditor updated', 'The auditor profile has been updated.');
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card padded={false}>
        <CardHeader title="Auditor details" description="Identity, contact and accreditation" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Full Name" requiredMark value={form.name} onChange={set('name')} error={errors.name}
            placeholder="e.g. Anand Krishnan" />
          <Input label="Email" type="email" requiredMark value={form.email} onChange={set('email')} error={errors.email}
            placeholder="auditor@example.com" helper="The auditor-portal login uses this address." />
          <Input label="Mobile" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="+91 98xxx xxxxx" />
          <Input label="Alternate Mobile" value={form.alternate_mobile} onChange={set('alternate_mobile')} error={errors.alternate_mobile} />
          <Select label="Auditor Type" required value={form.auditor_type_id} onChange={setSelect('auditor_type_id')} error={errors.auditor_type_id}
            placeholder="Select type" searchable
            options={lookups.auditorTypes.map((type) => ({ value: String(type.id), label: `${type.name} (${type.code})` }))} />
          <Input label="Role / Designation" value={form.role_title} onChange={set('role_title')} error={errors.role_title}
            placeholder="e.g. Lead Safety Auditor" />
          <Select label="Specialisation" value={form.specialization} onChange={setSelect('specialization')} error={errors.specialization}
            placeholder="Select specialisation" searchable
            options={AUDITOR_SPECIALIZATIONS.map((value) => ({ value, label: value }))} />
          <Input label="Qualification" value={form.qualification} onChange={set('qualification')} error={errors.qualification}
            placeholder="e.g. B.E. Mechanical, NEBOSH IGC" />
          <Input label="Experience (years)" type="number" step="0.5" min={0} max={70} value={form.experience_years}
            onChange={set('experience_years')} error={errors.experience_years} placeholder="e.g. 8.5" />
          <Input label="Date of Joining" type="date" value={form.date_of_joining} onChange={set('date_of_joining')} error={errors.date_of_joining} />
          <Select label="Status" value={form.status} onChange={setSelect('status')} error={errors.status}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <Input label="Max Concurrent Audits" type="number" min={1} max={50} value={form.max_concurrent_audits}
            onChange={set('max_concurrent_audits')} error={errors.max_concurrent_audits}
            helper="Assignment planning warns when this limit is reached." />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Address & banking" description="Used on audit reports and for fee payments" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <Textarea label="Address" rows={2} value={form.address} onChange={set('address')} error={errors.address} />
          </div>
          <Input label="City" value={form.city} onChange={set('city')} error={errors.city} placeholder="e.g. Coimbatore" />
          <Select label="State" value={form.state} onChange={setSelect('state')} error={errors.state} placeholder="Select state" searchable
            options={INDIAN_STATES.map((value) => ({ value, label: value }))} />
          <Input label="Pincode" value={form.pincode} onChange={set('pincode')} error={errors.pincode} maxLength={6} placeholder="641001" />
          <Input label="PAN Number" value={form.pan_number} onChange={set('pan_number')} error={errors.pan_number} placeholder="AABCC1234D" />
          <Input label="Aadhaar Number" value={form.aadhaar_number} onChange={set('aadhaar_number')} error={errors.aadhaar_number} maxLength={12} placeholder="12 digits" />
          <Input label="Bank Name" value={form.bank_name} onChange={set('bank_name')} error={errors.bank_name} />
          <Input label="Bank Account Number" value={form.bank_account_number} onChange={set('bank_account_number')} error={errors.bank_account_number} />
          <Input label="IFSC Code" value={form.ifsc_code} onChange={set('ifsc_code')} error={errors.ifsc_code} placeholder="IDIB000C123" />
          <Select label="Preferred Employer" value={form.assigned_employer_id} onChange={setSelect('assigned_employer_id')} error={errors.assigned_employer_id}
            placeholder="Any employer" searchable
            options={lookups.employers.map((employer) => ({ value: String(employer.id), label: `${employer.company_name} (${employer.employer_code})` }))} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Profile & documents" description="Photograph and accreditation certificates" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="auditor-photo">Photograph</label>
            <input id="auditor-photo" type="file" accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
              onChange={setPhoto('photo')} />
            {form.photo && <img src={form.photo} alt="Auditor photograph preview" className="mt-3 h-24 w-20 rounded-lg border border-line object-cover" />}
            <p className="mt-2 text-xs text-ink-muted">Stored on the auditor record and printed on audit reports.</p>
          </div>
          <div className="md:col-span-2">
            <MultiFileUpload
              label="Certificates & identity proofs"
              entityType="AUDITOR"
              entityId={auditor?.id ?? null}
              category="Auditor certificate"
              accept=".pdf,.jpg,.jpeg,.png"
              maxFiles={12}
            />
            <p className="mt-2 text-xs text-ink-muted">
              {mode === 'create'
                ? 'Certificates can be attached once the auditor record exists.'
                : 'Certificates, licences and identity proofs held against this auditor.'}
            </p>
          </div>
        </CardBody>
      </Card>

      {mode === 'create' && canProvisionLogin && (
        <Card padded={false}>
          <CardHeader title="Auditor portal access" description="Optional login so the auditor can work assignments online" />
          <CardBody className="space-y-4">
            <Checkbox
              label="Create an auditor-portal login for this auditor"
              checked={createPortalUser}
              onChange={(event) => {
                const next = (event.target as HTMLInputElement).checked;
                setCreatePortalUser(next);
                if (next) {
                  setForm((current) => ({
                    ...current,
                    portal_user_name: current.portal_user_name || current.name,
                    portal_user_email: current.portal_user_email || current.email,
                    portal_user_mobile: current.portal_user_mobile || current.mobile,
                  }));
                }
              }}
            />
            {createPortalUser && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="User Name" requiredMark value={form.portal_user_name} onChange={set('portal_user_name')} error={errors.portal_user_name} />
                <Input label="Login Email" type="email" requiredMark value={form.portal_user_email} onChange={set('portal_user_email')} error={errors.portal_user_email} />
                <Input label="Mobile" value={form.portal_user_mobile} onChange={set('portal_user_mobile')} error={errors.portal_user_mobile} />
              </div>
            )}
            {createPortalUser && (
              <p className="text-xs text-ink-muted">
                A temporary password is generated, emailed to the address above, and the auditor is asked to set
                their own password on first sign-in.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <LinkButton href={mode === 'edit' && auditor ? `/admin/auditors/${auditor.id}` : '/admin/auditors'} variant="outline">
          Cancel
        </LinkButton>
        <Button type="submit" loading={saving}>
          {mode === 'create' ? 'Register Auditor' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
