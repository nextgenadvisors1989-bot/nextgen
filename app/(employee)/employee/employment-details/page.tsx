import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getScoping } from '@/lib/auth/auth';
import { getMyProfile } from '@/services/employee.service';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'Employment Details' };
export const dynamic = 'force-dynamic';

/**
 * The employment half of the employee's own file, read-only.
 *
 * These are the facts the establishment carries: the employee number, the posting,
 * the dates and the wage structure. The employee may read them and ask for a
 * correction; the platform refuses an employee's write to any of them by name.
 */
export default async function EmployeeEmploymentDetailsPage() {
  const user = await requirePageUser();
  const { employeeId } = await getScoping(user.id);
  const profile = employeeId ? await getMyProfile(employeeId) : null;

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Employment Details"
          breadcrumbs={[{ label: 'Dashboard', href: '/employee/dashboard' }, { label: 'Employment Details' }]}
        />
        <EmptyState title="No employee record is linked to your login" subtitle="Ask your employer's administrator to link one." />
      </div>
    );
  }

  const employee = profile.employee;
  const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));
  const structure = (profile.salaryStructure ?? {}) as Record<string, unknown>;
  const items = (structure.items ?? []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employment Details"
        description="What your employer's register says about your employment. Ask them to correct anything that is wrong."
        breadcrumbs={[{ label: 'Dashboard', href: '/employee/dashboard' }, { label: 'Employment Details' }]}
      />

      <Card padded={false}>
        <CardHeader
          title={String(employee.name ?? 'Employment')}
          description={`${text(employee.employee_number)}${employee.designation ? ` · ${String(employee.designation)}` : ''}`}
          action={<Badge tone="slate">{text(employee.status)}</Badge>}
        />
        <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Employee number', employee.employee_number],
            ['Designation', employee.designation],
            ['Department', employee.department],
            ['Category', employee.category],
            ['Grade', employee.grade],
            ['Skill grade', employee.skill_grade],
            ['Nature of work', employee.nature_of_work],
            ['Place of work', employee.place_of_work],
            ['Shift / relay', employee.shift_relay],
            ['Weekly off', employee.weekly_off],
            ['Date of joining', employee.date_of_joining ? formatDate(String(employee.date_of_joining)) : null],
            ['Date of confirmation', employee.date_of_confirmation ? formatDate(String(employee.date_of_confirmation)) : null],
            ['Probation (months)', employee.probation_months],
            ['Wage type', employee.wage_type],
            ['PF number', employee.pf_number],
            ['UAN', employee.uan],
            ['ESI number', employee.esi_number],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
              <dt className="text-sm text-ink-muted">{String(label)}</dt>
              <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="What you are paid"
          description="Your wage structure as the establishment holds it. Statutory deductions are applied when payroll runs."
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Head</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Type</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                [
                  ['Basic', 'Earning', employee.basic_salary],
                  ['Dearness allowance', 'Earning', employee.da],
                  ['House rent allowance', 'Earning', employee.hra],
                  ['Other allowances', 'Earning', employee.other_allowances],
                  ['Gross salary', 'Total', employee.gross_salary],
                ].map(([label, type, amount]) => (
                  <tr key={String(label)} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 font-medium text-ink">{String(label)}</td>
                    <td className="px-6 py-3 text-ink-soft">{String(type)}</td>
                    <td className="px-6 py-3 text-right text-ink-soft">
                      {amount === null || amount === undefined ? '—' : formatCurrency(Number(amount))}
                    </td>
                  </tr>
                ))
              ) : (
                items.map((row, index) => (
                  <tr key={String(row.id ?? index)} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 font-medium text-ink">{String(row.head_name ?? row.name ?? '—')}</td>
                    <td className="px-6 py-3 text-ink-soft">{String(row.head_type ?? row.type ?? '—')}</td>
                    <td className="px-6 py-3 text-right text-ink-soft">{formatCurrency(Number(row.amount ?? 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
