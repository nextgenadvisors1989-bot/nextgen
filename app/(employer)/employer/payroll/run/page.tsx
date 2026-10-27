import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollMonitoring } from '@/components/payroll/payroll-monitoring';

export const metadata: Metadata = { title: 'Run Payroll' };
export const dynamic = 'force-dynamic';

export default async function RunPayrollPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Run Payroll</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Raise this month's payroll. Choose the month and the scope — the whole company, one unit or one department — and create the run; the engine then reads every active employee's live salary structure and the attendance marked for the month. Correct anything it flags and calculate again: recalculation rebuilds the run in one transaction, it never appends.
        </p>
      </header>
      <PayrollMonitoring
        panel="employer"
        canCreate={hasPermission(user.permissions, 'payroll.create')}
        canUpdate={hasPermission(user.permissions, 'payroll.update')}
        canExport={hasPermission(user.permissions, 'payroll.export')}
        canPublish={hasPermission(user.permissions, 'payslip.update')}
        openCreateOnMount
      />
    </div>
  );
}
