'use client';

/**
 * An establishment's own company file: the record, what the platform holds about
 * it, and the handful of fields the establishment may correct itself.
 *
 * The employer code, the lifecycle status and the portal login are shown but not
 * editable — those belong to the platform — so the form carries inputs only for
 * the fields the API will actually accept, and says why for the rest.
 */
import { useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';

interface EmployerRecord {
  id: number;
  company_name: string;
  employer_code: string;
  status: string;
  gst_number: string | null;
  pan_number: string | null;
  cin_number: string | null;
  industry_type: string | null;
  company_type: string | null;
  year_of_establishment: number | null;
  website_url: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  contact_person_name: string | null;
  contact_person_designation: string | null;
  contact_person_email: string | null;
  contact_person_mobile: string | null;
  notes: string | null;
}

interface ProfileResponse {
  employer: EmployerRecord | null;
  units: Record<string, unknown>[];
  departments: Record<string, unknown>[];
  employees: Record<string, unknown>[];
  stats: Record<string, unknown> | null;
}

/** The fields the API accepts from the establishment itself. */
const EDITABLE: { field: keyof EmployerRecord; label: string; type?: string }[] = [
  { field: 'company_name', label: 'Company name' },
  { field: 'gst_number', label: 'GSTIN' },
  { field: 'pan_number', label: 'PAN' },
  { field: 'cin_number', label: 'CIN' },
  { field: 'industry_type', label: 'Industry' },
  { field: 'company_type', label: 'Company type' },
  { field: 'year_of_establishment', label: 'Year of establishment', type: 'number' },
  { field: 'website_url', label: 'Website' },
  { field: 'email', label: 'Email', type: 'email' },
  { field: 'phone', label: 'Phone' },
  { field: 'mobile', label: 'Mobile' },
  { field: 'address_line_1', label: 'Address line 1' },
  { field: 'address_line_2', label: 'Address line 2' },
  { field: 'city', label: 'City' },
  { field: 'state', label: 'State' },
  { field: 'pincode', label: 'PIN code' },
  { field: 'contact_person_name', label: 'Contact person' },
  { field: 'contact_person_designation', label: 'Contact designation' },
  { field: 'contact_person_email', label: 'Contact email', type: 'email' },
  { field: 'contact_person_mobile', label: 'Contact mobile' },
];

export function CompanyProfile({ canUpdate = false, startInEdit = false }: { canUpdate?: boolean; startInEdit?: boolean }) {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(startInEdit);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<ProfileResponse>('/api/employer/profile');
        setProfile(response.data ?? null);
        const record = response.data?.employer;
        if (record) {
          const next: Record<string, string> = {};
          for (const { field } of EDITABLE) {
            const value = record[field];
            next[String(field)] = value === null || value === undefined ? '' : String(value);
          }
          setForm(next);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The company file could not be loaded');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const response = await api.patch<{ employer: EmployerRecord }>('/api/employer/profile', form);
      if (!response.ok) {
        setErrors(fieldErrors(response.raw as never));
        toast.error(response.message);
        return;
      }
      setProfile((current) => (current ? { ...current, employer: response.data?.employer ?? current.employer } : current));
      toast.success(response.message || 'Company profile updated');
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!profile?.employer) {
    return <EmptyState title="No company file is linked to this login" subtitle="Ask the platform's administrator to link your establishment." />;
  }

  const employer = profile.employer;
  const stats = profile.stats ?? {};
  const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Units" value={formatNumber(profile.units.length)} tone="brand" />
        <StatCard label="Departments" value={formatNumber(profile.departments.length)} tone="slate" />
        <StatCard
          label="Headcount"
          value={formatNumber(Number((stats as Record<string, unknown>).totalEmployees ?? (stats as Record<string, unknown>).employees ?? 0))}
          tone="emerald"
        />
        <StatCard label="Status" value={String(employer.status).replace(/^./, (c) => c.toUpperCase())} tone="slate" />
      </div>

      <Card padded={false}>
        <CardHeader
          title={employer.company_name}
          description={`${employer.employer_code}${employer.industry_type ? ` · ${employer.industry_type}` : ''}`}
          action={
            canUpdate ? (
              <Button variant={editing ? 'outline' : 'primary'} size="sm" onClick={() => setEditing((value) => !value)}>
                {editing ? 'Cancel' : 'Correct details'}
              </Button>
            ) : undefined
          }
        />

        {editing ? (
          <form className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3" onSubmit={save}>
            {EDITABLE.map(({ field, label, type }) => (
              <Input
                key={String(field)}
                type={type ?? 'text'}
                label={label}
                value={form[String(field)] ?? ''}
                error={errors[String(field)]}
                onChange={(event) => setForm((current) => ({ ...current, [String(field)]: event.target.value }))}
              />
            ))}
            <div className="sm:col-span-2 lg:col-span-3">
              <Input
                label="Notes for the auditor"
                value={form.notes ?? ''}
                error={errors.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
            <div className="flex justify-end sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save corrections'}</Button>
            </div>
            <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-3">
              The employer code, the establishment&rsquo;s status and its portal login are set by the platform and
              cannot be changed here.
            </p>
          </form>
        ) : (
          <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['GSTIN', employer.gst_number], ['PAN', employer.pan_number], ['CIN', employer.cin_number],
              ['Company type', employer.company_type], ['Established', employer.year_of_establishment],
              ['Website', employer.website_url], ['Email', employer.email], ['Phone', employer.phone],
              ['Mobile', employer.mobile], ['City', employer.city], ['State', employer.state],
              ['PIN code', employer.pincode], ['Country', employer.country],
              ['Contact person', employer.contact_person_name],
              ['Contact designation', employer.contact_person_designation],
              ['Contact email', employer.contact_person_email],
              ['Contact mobile', employer.contact_person_mobile],
              ['Address', [employer.address_line_1, employer.address_line_2].filter(Boolean).join(', ') || null],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
                <dt className="text-sm text-ink-muted">{String(label)}</dt>
                <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Units" description="Where the establishment operates." action={<Badge tone="slate">{profile.units.length}</Badge>} />
          {profile.units.length ? (
            <ul className="divide-y divide-line">
              {profile.units.map((unit) => (
                <li key={String(unit.id)} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{String(unit.unit_name)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[unit.unit_code, unit.city ?? unit.location, unit.state].filter(Boolean).map(String).join(' · ') || '—'}
                    </p>
                  </div>
                  <Badge tone={String(unit.status) === 'active' ? 'success' : 'slate'}>{String(unit.status ?? '—')}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="No units yet" subtitle="Add one from the Units screen." />}
        </Card>

        <Card padded={false}>
          <CardHeader title="Departments" description="How the establishment is organised." action={<Badge tone="slate">{profile.departments.length}</Badge>} />
          {profile.departments.length ? (
            <ul className="divide-y divide-line">
              {profile.departments.map((department) => (
                <li key={String(department.id)} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{String(department.department_name)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {String(department.department_code ?? '')}{department.head_of_department ? ` · ${String(department.head_of_department)}` : ''}
                    </p>
                  </div>
                  <Badge tone={String(department.status) === 'active' ? 'success' : 'slate'}>{String(department.status ?? '—')}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="No departments yet" subtitle="Add one from the Departments screen." />}
        </Card>
      </div>
    </div>
  );
}
