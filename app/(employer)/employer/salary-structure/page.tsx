import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { SalaryStructures } from '@/components/payroll/salary-structures';

export const metadata: Metadata = { title: 'Salary Structure' };
export const dynamic = 'force-dynamic';

export default async function EmployerSalaryStructurePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Salary Structure</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          What each of your employees is contracted to be paid, and the statutory switches behind it — provident fund with its ceiling, ESI, professional tax for your State and the labour welfare fund. Setting a new revision closes the previous one the day before, so the structure that was in force in a month is the one that produced that month's payslip.
        </p>
      </header>
      <SalaryStructures
        panel="employer"
        canCreate={hasPermission(user.permissions, 'salary_structure.create')}
        canUpdate={hasPermission(user.permissions, 'salary_structure.update')}
        canDelete={hasPermission(user.permissions, 'salary_structure.delete')}
      />
    </div>
  );
}
