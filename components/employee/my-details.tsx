'use client';

/**
 * The employee's own particulars, editable.
 *
 * Everything that belongs to the establishment — the employee number, the
 * designation, the wages, the unit — is shown read-only, because the platform
 * refuses those writes by name. Only the fields in the employee's own set are
 * inputs, and the form says so rather than letting somebody type into a field that
 * can never save.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

/** Form field -> label. Mirrors the server's own `SELF_EDITABLE_FIELDS`. */
const EDITABLE: { field: string; label: string; type?: string }[] = [
  { field: 'mobile', label: 'Mobile' },
  { field: 'telephone', label: 'Telephone' },
  { field: 'email', label: 'Email', type: 'email' },
  { field: 'present_address', label: 'Present address' },
  { field: 'permanent_address', label: 'Permanent address' },
  { field: 'state', label: 'State' },
  { field: 'pincode', label: 'PIN code' },
  { field: 'father_name', label: "Father's name" },
  { field: 'mother_name', label: "Mother's name" },
  { field: 'spouse_name', label: "Spouse's name" },
  { field: 'blood_group', label: 'Blood group' },
  { field: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { field: 'aadhaar_number', label: 'Aadhaar number' },
  { field: 'pan_number', label: 'PAN' },
  { field: 'bank_name', label: 'Bank' },
  { field: 'bank_account_number', label: 'Account number' },
  { field: 'ifsc_code', label: 'IFSC' },
];

const READ_ONLY: { key: string; label: string }[] = [
  { key: 'employee_number', label: 'Employee number' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'date_of_joining', label: 'Date of joining' },
  { key: 'category', label: 'Category' },
  { key: 'gross_salary', label: 'Gross salary' },
];

interface ProfileResponse {
  employee: Record<string, unknown>;
  stats?: Record<string, unknown>;
  checklist?: Record<string, unknown>[];
}

export function MyDetails() {
  const toast = useToast();
  const [employee, setEmployee] = useState<Record<string, unknown> | null>(null);
  const [checklist, setChecklist] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<ProfileResponse>('/api/employee/profile');
        const record = response.data?.employee ?? null;
        setEmployee(record);
        setChecklist(response.data?.checklist ?? []);
        if (record) {
          const next: Record<string, string> = {};
          for (const { field } of EDITABLE) {
            const value = record[field];
            next[field] = value === null || value === undefined ? '' : String(value);
          }
          setForm(next);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Your details could not be loaded');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const checked = useMemo(() => checklist.filter((row) => Number(row.is_checked ?? 0) === 1).length, [checklist]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const response = await api.patch<{ employee: Record<string, unknown> }>('/api/employee/profile', form);
      if (!response.ok) {
        setErrors(fieldErrors(response.raw as never));
        toast.error(response.message);
        return;
      }
      setEmployee(response.data?.employee ?? employee);
      toast.success(response.message || 'Your details were updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!employee) {
    return <EmptyState title="No employee record is linked to your login" subtitle="Ask your employer's administrator to link one." />;
  }

  return (
    <div className="space-y-6">
      <Card padded={false}>
        <CardHeader
          title="Employment particulars"
          description="Maintained by your employer. Ask them to correct anything that is wrong here."
          action={<Badge tone="slate">{String(employee.status ?? 'active')}</Badge>}
        />
        <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {READ_ONLY.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
              <dt className="text-sm text-ink-muted">{row.label}</dt>
              <dd className="text-right text-sm font-medium text-ink">
                {employee[row.key] === null || employee[row.key] === undefined || employee[row.key] === ''
                  ? '—'
                  : String(employee[row.key])}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Your own particulars"
          description="Contact, address, family, identity and bank details — yours to keep current."
          action={<span className="text-xs text-ink-muted">{checked}/{checklist.length} personal-file items checked</span>}
        />
        <form className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3" onSubmit={save}>
          {EDITABLE.map(({ field, label, type }) => (
            <Input
              key={field}
              type={type ?? 'text'}
              label={label}
              value={form[field] ?? ''}
              error={errors[field]}
              onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
            />
          ))}
          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save my details'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
