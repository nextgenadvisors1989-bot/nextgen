import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayslipRegister } from '@/components/payroll/payslip-register';

export const metadata: Metadata = { title: 'Downloads' };
export const dynamic = 'force-dynamic';

export default async function EmployerDownloadsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Downloads</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Your company's payslips and generated documents in one place. Every published payslip is downloadable as the bilingual PDF the employee received, and the month's pay register exports as CSV for the bank or the auditor.
        </p>
      </header>
      <PayslipRegister
        panel="employer"
        canUpdate={false}
        canGenerate={hasPermission(user.permissions, 'payslip.download')}
      />
    </div>
  );
}
