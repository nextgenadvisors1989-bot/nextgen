import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PayrollRunDetail } from '@/components/payroll/payroll-run-detail';

export const metadata: Metadata = { title: 'Payroll Run' };
export const dynamic = 'force-dynamic';

export default async function EmployerPayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Payroll Run</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          This run, its payslips and the steps left in its lifecycle. The statutory position above the table is what your company remits: the provident fund and ESI shares, the professional tax and labour welfare fund due to the State, and the provisional tax recovered from the employees.
        </p>
      </header>
      <PayrollRunDetail
        runId={Number((await params).runId)}
        panel="employer"
        canUpdate={hasPermission(user.permissions, 'payroll.update')}
        canPublish={hasPermission(user.permissions, 'payslip.update')}
        canGenerate={hasPermission(user.permissions, 'payslip.download')}
      />
    </div>
  );
}
