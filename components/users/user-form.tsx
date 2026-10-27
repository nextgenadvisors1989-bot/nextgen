'use client';

/**
 * Create / edit form for a login account.
 *
 * Create mode is the "provision a user" flow from the specification: name,
 * email, optional username, roles, an optional employer/auditor/employee link,
 * and — unless the administrator types a password — generated credentials that
 * go out by email with a 72-hour activation link. The generated password is
 * shown exactly once, in the success panel, so it can be handed over in person.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { PORTAL_LABELS } from '@/components/users/shared';

interface Option {
  value: string;
  label: string;
  description?: string;
}

export interface UserFormValues {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  mobile: string;
  role_slugs: string[];
  status: 'active' | 'inactive' | 'suspended';
  send_credentials: boolean;
  password: string;
  set_password: boolean;
  employer_id: string;
  auditor_id: string;
  employee_id: string;
}

export const EMPTY_USER_FORM: UserFormValues = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  mobile: '',
  role_slugs: [],
  status: 'active',
  send_credentials: true,
  password: '',
  set_password: false,
  employer_id: '',
  auditor_id: '',
  employee_id: '',
};

export interface ProvisionResult {
  userId: number;
  name: string;
  email: string;
  username: string;
  roleNames: string;
  credentials: { username: string; temporaryPassword: string; email: string };
  activation: { sent: boolean; emailed: boolean; provider?: string; message: string };
  linked: string[];
}

/** Multi-select for roles — a table of checkboxes with the portal each role maps to. */
function RolePicker({
  options,
  selected,
  onChange,
  error,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((slug) => slug !== value) : [...selected, value]);
  };

  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-ink-soft">
        Roles <span className="text-red-500">*</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              type="button"
              key={option.value}
              onClick={() => toggle(option.value)}
              aria-pressed={checked}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                checked ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:bg-surface-muted'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white'
                }`}
              >
                {checked && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                {option.description && <span className="mt-0.5 block text-[12px] text-ink-muted">{option.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

export function UserForm({
  mode,
  roleOptions,
  initialValues = EMPTY_USER_FORM,
  userId,
  linkOptions,
  onProvisioned,
}: {
  mode: 'create' | 'edit';
  roleOptions: Option[];
  initialValues?: UserFormValues;
  userId?: number;
  linkOptions?: {
    employers: { id: number; label: string }[];
    auditors: { id: number; label: string }[];
    employees: { id: number; label: string }[];
  };
  onProvisioned?: (result: ProvisionResult) => void;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<UserFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit() {
    setSaving(true);
    setErrors({});
    try {
      if (mode === 'create') {
        const payload: Record<string, unknown> = {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          role_slugs: values.role_slugs,
          status: values.status,
          send_credentials: values.send_credentials,
        };
        if (values.username) payload.username = values.username;
        if (values.mobile) payload.mobile = values.mobile;
        if (values.set_password && values.password) payload.password = values.password;
        if (values.employer_id) payload.employer_id = Number(values.employer_id);
        if (values.auditor_id) payload.auditor_id = Number(values.auditor_id);
        if (values.employee_id) payload.employee_id = Number(values.employee_id);

        const result = await api.post<ProvisionResult>('/api/admin/users', payload);
        if (!result.ok) {
          setErrors(fieldErrors(result));
          errorToast(result.message);
          return;
        }
        success(`Login created for ${result.data?.email ?? values.email}`);
        onProvisioned?.(result.data as ProvisionResult);
        return;
      }

      const payload: Record<string, unknown> = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        status: values.status,
      };
      if (values.username) payload.username = values.username;
      if (values.mobile) payload.mobile = values.mobile;

      const result = await api.patch(`/api/admin/users/${userId}`, payload);
      if (!result.ok) {
        setErrors(fieldErrors(result));
        errorToast(result.message);
        return;
      }
      success(result.message || 'Account updated');
      router.push(`/admin/users/${userId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const employerOptions = [{ value: '', label: 'Not linked' }, ...(linkOptions?.employers ?? []).map((row) => ({ value: String(row.id), label: row.label }))];
  const auditorOptions = [{ value: '', label: 'Not linked' }, ...(linkOptions?.auditors ?? []).map((row) => ({ value: String(row.id), label: row.label }))];
  const employeeOptions = [{ value: '', label: 'Not linked' }, ...(linkOptions?.employees ?? []).map((row) => ({ value: String(row.id), label: row.label }))];

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
        <div>
          <h2 className="section-title">Account holder</h2>
          <p className="mt-1 text-[13px] text-ink-muted">The person behind the login. Their name appears throughout the audit trail.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name" required value={values.first_name}
            onChange={(event) => set('first_name', event.target.value)}
            error={errors.first_name} placeholder="Priya"
          />
          <Input
            label="Last name" required value={values.last_name}
            onChange={(event) => set('last_name', event.target.value)}
            error={errors.last_name} placeholder="Raman"
          />
          <Input
            label="Email address" required type="email" value={values.email}
            onChange={(event) => set('email', event.target.value)}
            error={errors.email} placeholder="priya.raman@company.com"
            helper="Credentials, notifications and password resets are sent here."
          />
          <Input
            label="Mobile" value={values.mobile}
            onChange={(event) => set('mobile', event.target.value)}
            error={errors.mobile} placeholder="+91 98765 43210"
          />
          <Input
            label="Username" value={values.username}
            onChange={(event) => set('username', event.target.value)}
            error={errors.username} placeholder="priya.raman"
            helper={mode === 'create' ? 'Leave blank to generate one from the name.' : undefined}
          />
          <Select
            label="Account status" value={values.status}
            onChange={(value) => set('status', value as UserFormValues['status'])}
            options={[
              { value: 'active', label: 'Active — can sign in' },
              { value: 'inactive', label: 'Inactive — sign-in blocked' },
              { value: 'suspended', label: 'Suspended — sign-in blocked' },
            ]}
          />
        </div>
        </CardBody>
      </Card>

      {mode === 'create' ? (
        <Card>
          <CardBody className="space-y-5">
          <div>
            <h2 className="section-title">Access</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              A login needs at least one role — the roles decide which panel opens after sign-in and what the API will
              let the account do.
            </p>
          </div>
            <RolePicker
              options={roleOptions}
              selected={values.role_slugs}
              onChange={(next) => set('role_slugs', next)}
              error={errors.role_slugs}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Employer link" value={values.employer_id}
                onChange={(value) => set('employer_id', value)}
                options={employerOptions} searchable clearable
                helper="Scopes employer-portal logins to one company."
              />
              <Select
                label="Auditor link" value={values.auditor_id}
                onChange={(value) => set('auditor_id', value)}
                options={auditorOptions} searchable clearable
                helper="Binds the login to an auditor record."
              />
              <Select
                label="Employee link" value={values.employee_id}
                onChange={(value) => set('employee_id', value)}
                options={employeeOptions} searchable clearable
                helper="Binds the login to an employee record."
              />
            </div>

            <div className="rounded-lg border border-line bg-surface-muted p-4">
              <Switch
                checked={values.send_credentials}
                onChange={(checked) => set('send_credentials', checked)}
                label="Email credentials with a 72-hour activation link"
              />
              <p className="mt-2 text-[12px] text-ink-muted">
                The recipient gets the username, a one-time temporary password and an activation link. The
                password is never stored in plain text and is shown only once after creation.
              </p>

              <div className="mt-4">
                <Switch
                  checked={values.set_password}
                  onChange={(checked) => set('set_password', checked)}
                  label="Set the password now instead"
                />
                {values.set_password && (
                  <div className="mt-3 max-w-md">
                    <Input
                      label="Temporary password" type="text" value={values.password}
                      onChange={(event) => set('password', event.target.value)}
                      error={errors.password}
                      helper="At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol."
                    />
                  </div>
                )}
              </div>
            </div>
          </CardBody>
          <CardFooter className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <span className="mr-auto text-[12px] text-ink-muted">Roles and portal links are editable from the detail screen too.</span>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-3">
          <h2 className="section-title">Access</h2>
          <p className="text-sm text-ink-soft">
            Role assignment, status switching, password resets and session revocation live on the{' '}
            <a href={`/admin/users/${userId}`} className="text-brand-600 underline-offset-2 hover:underline">account detail screen</a>.
          </p>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <LinkButton href={mode === 'create' ? '/admin/users' : `/admin/users/${userId}`} variant="outline">
          Cancel
        </LinkButton>
        <Button onClick={submit} loading={saving}>
          {mode === 'create' ? 'Create login' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

export { PORTAL_LABELS };
