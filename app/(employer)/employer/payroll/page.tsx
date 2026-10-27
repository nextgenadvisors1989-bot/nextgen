import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollMonitoring } from '@/components/payroll/payroll-monitoring';

export const metadata: Metadata = { title: 'Payroll' };
export const dynamic = 'force-dynamic';

export default async function EmployerPayrollPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payroll</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Your company's monthly payroll. Raise a run for a month, calculate it and review the head-wise totals, then approve, lock and publish — each employee gets their payslip in the portal, by email and by SMS. The bank file is one click from here.
        </p>
      </header>
      <PayrollMonitoring
        panel="employer"
        canCreate={hasPermission(user.permissions, 'payroll.create')}
        canUpdate={hasPermission(user.permissions, 'payroll.update')}
        canExport={hasPermission(user.permissions, 'payroll.export')}
        canPublish={hasPermission(user.permissions, 'payslip.update')}
      />
    </div>
  );
}
