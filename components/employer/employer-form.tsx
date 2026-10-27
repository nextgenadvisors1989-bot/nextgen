'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, LinkButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { EMPLOYER_INDUSTRIES, COMPANY_TYPES, INDIAN_STATES, type Employer } from '@/types/employer';

type FormState = Record<string, string>;

const EMPTY: FormState = {
  company_name: '', employer_code: '', gst_number: '', pan_number: '', cin_number: '',
  industry_type: '', company_type: '', year_of_establishment: '', website_url: '',
  email: '', phone: '', mobile: '', fax: '',
  address_line_1: '', address_line_2: '', city: '', state: '', pincode: '', country: 'India',
  contact_person_name: '', contact_person_designation: '', contact_person_email: '',
  contact_person_mobile: '', contact_person_alternate_mobile: '',
  approximate_employee_count: '',
  compliance_contact_person: '', compliance_contact_email: '', compliance_contact_phone: '',
  payroll_contact_person: '', payroll_contact_email: '', payroll_contact_phone: '',
  notes: '', status: 'active',
  portal_user_name: '', portal_user_email: '', portal_user_mobile: '',
};

/**
 * Employer create / edit form. One component serves both routes so the field
 * set, validation surface and API contract can never drift apart.
 */
export function EmployerForm({ mode, employer }: { mode: 'create' | 'edit'; employer?: Employer }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<FormState>(() => {
    if (mode === 'edit' && employer) {
      const seeded: FormState = { ...EMPTY };
      for (const key of Object.keys(EMPTY)) {
        const value = (employer as unknown as Record<string, unknown>)[key];
        seeded[key] = value === null || value === undefined ? '' : String(value);
      }
      seeded.portal_user_name = '';
      seeded.portal_user_email = '';
      seeded.portal_user_mobile = '';
      return seeded;
    }
    return EMPTY;
  });
  const [createPortalUser, setCreatePortalUser] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const setSelect = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload: Record<string, unknown> = { ...form };
    // Numeric fields must travel as numbers, empty strings must travel as null.
    for (const key of ['year_of_establishment', 'approximate_employee_count'] as const) {
      payload[key] = form[key] === '' ? null : Number(form[key]);
    }
    payload.create_portal_user = createPortalUser;

    const result = mode === 'create'
      ? await api.post<{ employerId: number }>('/api/admin/employers', payload)
      : await api.put<{ employer: Employer }>(`/api/admin/employers/${employer?.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      const list = fieldErrors(result);
      setErrors(list);
      errorToast('Could not save employer', result.message);
      return;
    }

    if (mode === 'create') {
      const created = result.raw as { employerId: number; portalCredentials?: { username: string; temporaryPassword: string } };
      success('Employer created', `${form.company_name} is now available in the employer register.`);
      if (created.portalCredentials) {
        success(
          'Portal login created',
          `Username ${created.portalCredentials.username} — a temporary password was emailed to ${form.portal_user_email}.`
        );
      }
      router.push(`/admin/employers/${created.employerId}`);
    } else {
      success('Employer updated', 'The employer record has been updated.');
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card padded={false}>
        <CardHeader title="Company details" description="Legal name and registration identifiers" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Company Name" requiredMark value={form.company_name} onChange={set('company_name')} error={errors.company_name}
            placeholder="e.g. Sri Balaji Textiles Private Limited" />
          <Input label="Employer Code" requiredMark value={form.employer_code} onChange={set('employer_code')} error={errors.employer_code}
            placeholder="e.g. SBT-001" helper="Letters, numbers, hyphen, underscore or slash." disabled={mode === 'edit'} />
          <Select label="Industry" value={form.industry_type} onChange={setSelect('industry_type')} error={errors.industry_type}
            placeholder="Select industry" searchable options={EMPLOYER_INDUSTRIES.map((value) => ({ value, label: value }))} />
          <Select label="Company Type" value={form.company_type} onChange={setSelect('company_type')} error={errors.company_type}
            placeholder="Select type" options={COMPANY_TYPES.map((value) => ({ value, label: value }))} />
          <Input label="Year of Establishment" type="number" min={1800} max={new Date().getFullYear()} value={form.year_of_establishment}
            onChange={set('year_of_establishment')} error={errors.year_of_establishment} placeholder="e.g. 2008" />
          <Input label="Website" value={form.website_url} onChange={set('website_url')} error={errors.website_url} placeholder="https://example.com" />
          <Input label="GST Number" value={form.gst_number} onChange={set('gst_number')} error={errors.gst_number} placeholder="33AABCC1234D1Z5" />
          <Input label="PAN Number" value={form.pan_number} onChange={set('pan_number')} error={errors.pan_number} placeholder="AABCC1234D" />
          <Input label="CIN Number" value={form.cin_number} onChange={set('cin_number')} error={errors.cin_number} placeholder="U72900TN2019PTC123456" />
          <Input label="Approximate Employee Count" type="number" min={0} value={form.approximate_employee_count}
            onChange={set('approximate_employee_count')} error={errors.approximate_employee_count} placeholder="e.g. 240" />
          <Select label="Status" value={form.status} onChange={setSelect('status')} error={errors.status}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Registered address" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Address Line 1" value={form.address_line_1} onChange={set('address_line_1')} error={errors.address_line_1} placeholder="Door no., street" />
          <Input label="Address Line 2" value={form.address_line_2} onChange={set('address_line_2')} error={errors.address_line_2} placeholder="Area, locality" />
          <Input label="City" value={form.city} onChange={set('city')} error={errors.city} placeholder="e.g. Coimbatore" />
          <Select label="State" value={form.state} onChange={setSelect('state')} error={errors.state} placeholder="Select state" searchable
            options={INDIAN_STATES.map((value) => ({ value, label: value }))} />
          <Input label="Pincode" value={form.pincode} onChange={set('pincode')} error={errors.pincode} placeholder="641001" maxLength={6} />
          <Input label="Country" value={form.country} onChange={set('country')} error={errors.country} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Contact person" description="Primary point of contact for audits and compliance" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Full Name" value={form.contact_person_name} onChange={set('contact_person_name')} error={errors.contact_person_name} />
          <Input label="Designation" value={form.contact_person_designation} onChange={set('contact_person_designation')} error={errors.contact_person_designation} placeholder="e.g. HR Manager" />
          <Input label="Email" type="email" value={form.contact_person_email} onChange={set('contact_person_email')} error={errors.contact_person_email} />
          <Input label="Mobile" value={form.contact_person_mobile} onChange={set('contact_person_mobile')} error={errors.contact_person_mobile} placeholder="+91 98xxx xxxxx" />
          <Input label="Alternate Mobile" value={form.contact_person_alternate_mobile} onChange={set('contact_person_alternate_mobile')} error={errors.contact_person_alternate_mobile} />
          <Input label="Landline" value={form.phone} onChange={set('phone')} error={errors.phone} />
          <Input label="Company Mobile" value={form.mobile} onChange={set('mobile')} error={errors.mobile} />
          <Input label="Company Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
          <Input label="Fax" value={form.fax} onChange={set('fax')} error={errors.fax} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Compliance & payroll contacts" description="Who we contact for statutory filings and payroll queries" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Compliance Contact" value={form.compliance_contact_person} onChange={set('compliance_contact_person')} error={errors.compliance_contact_person} />
          <Input label="Compliance Email" type="email" value={form.compliance_contact_email} onChange={set('compliance_contact_email')} error={errors.compliance_contact_email} />
          <Input label="Compliance Phone" value={form.compliance_contact_phone} onChange={set('compliance_contact_phone')} error={errors.compliance_contact_phone} />
          <Input label="Payroll Contact" value={form.payroll_contact_person} onChange={set('payroll_contact_person')} error={errors.payroll_contact_person} />
          <Input label="Payroll Email" type="email" value={form.payroll_contact_email} onChange={set('payroll_contact_email')} error={errors.payroll_contact_email} />
          <Input label="Payroll Phone" value={form.payroll_contact_phone} onChange={set('payroll_contact_phone')} error={errors.payroll_contact_phone} />
        </CardBody>
      </Card>

      {mode === 'create' && (
        <Card padded={false}>
          <CardHeader title="Employer portal access" description="Optional login for the employer's own HR team" />
          <CardBody className="space-y-4">
            <Checkbox
              label="Create an employer portal login for the primary contact"
              checked={createPortalUser}
              onChange={(event) => {
                const next = (event.target as HTMLInputElement).checked;
                setCreatePortalUser(next);
                if (next) {
                  setForm((current) => ({
                    ...current,
                    portal_user_name: current.portal_user_name || current.contact_person_name,
                    portal_user_email: current.portal_user_email || current.contact_person_email,
                    portal_user_mobile: current.portal_user_mobile || current.contact_person_mobile,
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
                A temporary password is generated, emailed to the address above, and the user is asked to set
                their own password on first sign-in.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card padded={false}>
        <CardHeader title="Internal notes" description="Visible to administrators only" />
        <CardBody>
          <Textarea label="Notes" rows={4} value={form.notes} onChange={set('notes')} error={errors.notes}
            placeholder="Contract terms, escalation contacts, billing arrangements…" />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <LinkButton href={mode === 'edit' && employer ? `/admin/employers/${employer.id}` : '/admin/employers'} variant="ghost">
          Cancel
        </LinkButton>
        <Button type="submit" loading={saving}>{mode === 'create' ? 'Create Employer' : 'Save Changes'}</Button>
      </div>
    </form>
  );
}
