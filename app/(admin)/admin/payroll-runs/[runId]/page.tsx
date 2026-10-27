import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollRunDetail } from '@/components/payroll/payroll-run-detail';

export const metadata: Metadata = { title: 'Payroll Run' };
export const dynamic = 'force-dynamic';

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payroll Run</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          One run, its payslips and every step the lifecycle allows at this state — recalculate after an attendance correction, approve, lock, mark paid, publish the payslips to the employees, generate the PDFs and download the bank file. The statutory position above the table is what gets remitted to the EPFO, the ESIC and the State.
        </p>
      </header>
      <PayrollRunDetail
        runId={Number((await params).runId)}
        panel="admin"
        canUpdate={hasPermission(user.permissions, 'payroll.update')}
        canPublish={hasPermission(user.permissions, 'payslip.update')}
        canGenerate={hasPermission(user.permissions, 'payslip.download')}
      />
    </div>
  );
}
