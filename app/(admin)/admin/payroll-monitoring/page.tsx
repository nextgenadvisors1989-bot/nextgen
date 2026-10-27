import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollMonitoring } from '@/components/payroll/payroll-monitoring';

export const metadata: Metadata = { title: 'Payroll Monitoring' };
export const dynamic = 'force-dynamic';


export default async function PayrollMonitoringPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payroll Monitoring</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Every company&apos;s monthly payroll in one register. Create a run, calculate it and the engine builds one payslip per
          eligible employee from the live salary structure, the attendance actually marked and the statutory rates — provident fund,
          ESI, professional tax, labour welfare fund and a provisional TDS. Approve and lock the run, generate the bilingual payslip
          PDFs, publish them to the employees and take the bank file away.
        </p>
      </header>
      <PayrollMonitoring
        panel="admin"
        canCreate={hasPermission(user.permissions, 'payroll.create')}
        canUpdate={hasPermission(user.permissions, 'payroll.update')}
        canExport={hasPermission(user.permissions, 'payroll.export')}
        canPublish={hasPermission(user.permissions, 'payslip.update')}
      />
    </div>
  );
}

