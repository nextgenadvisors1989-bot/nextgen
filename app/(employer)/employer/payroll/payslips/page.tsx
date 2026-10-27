import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayslipRegister } from '@/components/payroll/payslip-register';

export const metadata: Metadata = { title: 'Payslips' };
export const dynamic = 'force-dynamic';

export default async function EmployerPayslipsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payslips</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Your company's payslip register. Filter by month, payment status or whether the payslip has been published, mark the salary upload as paid in one action, export the month as CSV, and open any payslip to read the head-wise statement or reprint the bilingual PDF.
        </p>
      </header>
      <PayslipRegister
        panel="employer"
        canUpdate={hasPermission(user.permissions, 'payslip.update')}
        canGenerate={hasPermission(user.permissions, 'payslip.download')}
      />
    </div>
  );
}
