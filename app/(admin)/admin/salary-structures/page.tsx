import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { SalaryStructures } from '@/components/payroll/salary-structures';

export const metadata: Metadata = { title: 'Salary Structures' };
export const dynamic = 'force-dynamic';

export default async function SalaryStructuresPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Salary Structures</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          The wage contract behind every payslip, across every company. A structure carries the contractual heads, the statutory switches the engine reads and a revision number; setting a new one closes the previous revision the day before, so the structure that was live in a month is the one that produced that month's payslip.
        </p>
      </header>
      <SalaryStructures
        panel="admin"
        canCreate={hasPermission(user.permissions, 'salary_structure.create')}
        canUpdate={hasPermission(user.permissions, 'salary_structure.update')}
        canDelete={hasPermission(user.permissions, 'salary_structure.delete')}
      />
    </div>
  );
}
