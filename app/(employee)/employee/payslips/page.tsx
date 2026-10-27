import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { MyPayslips } from '@/components/employee/my-pay';

export const metadata: Metadata = { title: 'My Payslips' };
export const dynamic = 'force-dynamic';

export default async function EmployeePayslipsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">My Payslips</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Your wage statements. Each payslip shows the days that were paid for the month, every earning and deduction head by head with the Tamil name beside it, the provident fund and ESI the employer contributes (which is not deducted from you), and the net pay in figures and in words. Download the PDF and keep it — it is your record of what was paid.
        </p>
      </header>
      <MyPayslips canDownload={hasPermission(user.permissions, 'payslip.download')} />
    </div>
  );
}
