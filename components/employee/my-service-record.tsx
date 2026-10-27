'use client';

/**
 * The employee's service record: the periods of employment the platform holds,
 * their qualifications and their previous experience.
 *
 * Read-only on purpose — an employment history is verified by the establishment
 * rather than typed by the person it describes.
 */
import { useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

interface ServiceRecordResponse {
  employee: Record<string, unknown>;
  records: Record<string, unknown>[];
  qualifications: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  totalRecords: number;
}

const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

export function MyServiceRecord() {
  const [data, setData] = useState<ServiceRecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<ServiceRecordResponse>('/api/employee/service-record');
        setData(response.data ?? null);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'Your service record could not be loaded');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <EmptyState title="The service record could not be loaded" subtitle={error} />;
  if (!data) return <EmptyState title="No employee record is linked to your login" />;

  const employee = data.employee ?? {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Periods recorded" value={formatNumber(data.records?.length ?? 0)} tone="brand" />
        <StatCard label="Qualifications" value={formatNumber(data.qualifications?.length ?? 0)} tone="slate" />
        <StatCard label="Previous employers" value={formatNumber(data.experience?.length ?? 0)} tone="slate" />
      </div>

      <Card padded={false}>
        <CardHeader title="Current employment" description="Your position on the establishment's register." />
        <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Employee number', employee.employee_number],
            ['Designation', employee.designation],
            ['Department', employee.department],
            ['Date of joining', employee.date_of_joining ? formatDate(String(employee.date_of_joining)) : '—'],
            ['Category', employee.category],
            ['Status', employee.status],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
              <dt className="text-sm text-ink-muted">{String(label)}</dt>
              <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padded={false}>
        <CardHeader title="Periods of service" description="Every employment period the platform holds about you." />
        {data.records?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Employer', 'Designation', 'From', 'To', 'Period', 'Last drawn'].map((header) => (
                    <th key={header} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.map((row, index) => (
                  <tr key={String(row.id ?? index)} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 font-medium text-ink">{text(row.employer_name)}</td>
                    <td className="px-6 py-3 text-ink-soft">{text(row.designation)}</td>
                    <td className="px-6 py-3 text-ink-muted">{row.date_from ? formatDate(String(row.date_from)) : '—'}</td>
                    <td className="px-6 py-3 text-ink-muted">{row.date_to ? formatDate(String(row.date_to)) : '—'}</td>
                    <td className="px-6 py-3 text-ink-soft">{text(row.total_period)}</td>
                    <td className="px-6 py-3 text-ink-soft">{row.last_drawn_salary ? formatNumber(Number(row.last_drawn_salary)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No previous periods on file" subtitle="Your employer records your service history as it is verified." />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Qualifications" />
          {data.qualifications?.length ? (
            <ul className="divide-y divide-line">
              {data.qualifications.map((row, index) => (
                <li key={String(row.id ?? index)} className="px-6 py-3">
                  <p className="text-sm font-medium text-ink">{text(row.qualification)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {[row.specialization, row.institution, row.year_of_passing].filter(Boolean).map(String).join(' · ') || '—'}
                  </p>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Nothing recorded" />}
        </Card>

        <Card padded={false}>
          <CardHeader title="Previous experience" />
          {data.experience?.length ? (
            <ul className="divide-y divide-line">
              {data.experience.map((row, index) => (
                <li key={String(row.id ?? index)} className="px-6 py-3">
                  <p className="text-sm font-medium text-ink">{text(row.employer_name ?? row.company_name)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {[row.designation, row.date_from ? formatDate(String(row.date_from)) : null,
                      row.date_to ? formatDate(String(row.date_to)) : null].filter(Boolean).map(String).join(' · ') || '—'}
                  </p>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Nothing recorded" />}
        </Card>
      </div>
    </div>
  );
}
