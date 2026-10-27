import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayslipRegister } from '@/components/payroll/payslip-register';

export const metadata: Metadata = { title: 'Pay Register' };
export const dynamic = 'force-dynamic';

export default async function PayRegisterPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Pay Register</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Every payslip on the platform — the register an inspector asks for and the reconciliation the payroll office runs against the bank statement. Tick the payslips the bank has settled to mark them in one action, export the month as CSV, and open any payslip to read its head-wise statement or print the bilingual PDF.
        </p>
      </header>
      <PayslipRegister
        panel="admin"
        canUpdate={hasPermission(user.permissions, 'payslip.update')}
        canGenerate={hasPermission(user.permissions, 'payslip.download')}
      />
    </div>
  );
}
