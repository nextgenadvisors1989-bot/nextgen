import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollMonitoring } from '@/components/payroll/payroll-monitoring';

export const metadata: Metadata = { title: 'Payroll History' };
export const dynamic = 'force-dynamic';

export default async function PayrollHistoryPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payroll History</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Every payroll run your company has raised, month by month, with the gross, the deductions and the net that went out. Open any run to see its payslips and the statutory position behind it — the record stays available for inspection and for the employee who asks about a month from last year.
        </p>
      </header>
      <PayrollMonitoring
        panel="employer"
        canCreate={false}
        canUpdate={false}
        canExport={hasPermission(user.permissions, 'payroll.export')}
        canPublish={false}
      />
    </div>
  );
}
