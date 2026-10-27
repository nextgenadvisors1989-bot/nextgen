import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { EmployeeDetailView } from '@/components/employee/employee-detail';
import { getEmployeeDetail } from '@/services/employee.service';
import * as repo from '@/repositories/employee.repository';

export const metadata: Metadata = { title: 'Employee' };
export const dynamic = 'force-dynamic';

/**
 * One of the establishment's own employees, in full: the personal file, the wage
 * structure, the child registers and the checklist.
 *
 * The employee is resolved through `findEmployeeScoped` first, so another
 * company's employee is a 404 rather than a page that half-loads.
 */
export default async function EmployerEmployeeDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const user = await requirePageUser();
  const { employeeId } = await params;
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const scoped = await repo.findEmployeeScoped(id, Number(user.employerId ?? 0));
  if (!scoped) notFound();

  const detail = await getEmployeeDetail(id, { includeLogin: false });
  if (!detail) notFound();

  const employee = detail.employee as unknown as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Breadcrumb items={[
            { label: 'Dashboard', href: '/employer/dashboard' },
            { label: 'Employees', href: '/employer/employees' },
            { label: String(employee.name ?? 'Employee') },
          ]} />
          <h1 className="text-xl font-semibold text-ink">{String(employee.name ?? 'Employee')}</h1>
          <p className="text-sm text-ink-muted">
            {String(employee.employee_number ?? '')}
            {employee.designation ? ` · ${String(employee.designation)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/employer/employees" className="text-sm font-medium text-brand-600 hover:underline">All employees</Link>
          {hasPermission(user.permissions, 'employee.update') ? (
            <Link href={`/employer/employees/${id}/edit`}>
              <Button size="sm" variant="outline">Edit particulars</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <EmployeeDetailView
        basePath="/api/employer"
        detail={{
          ...detail,
          // The establishment's view never carries the portal-account block.
          login: null,
        } as unknown as Parameters<typeof EmployeeDetailView>[0]['detail']}
        permissions={{
          create: hasPermission(user.permissions, 'employee.create'),
          update: hasPermission(user.permissions, 'employee.update'),
          remove: hasPermission(user.permissions, 'employee.delete'),
        }}
      />
    </div>
  );
}
