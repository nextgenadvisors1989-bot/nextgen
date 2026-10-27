import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser } from '@/lib/auth/permission-check';
import { CtcChart } from '@/components/payroll/ctc-chart';

export const metadata: Metadata = { title: 'CTC Chart' };
export const dynamic = 'force-dynamic';

export default async function EmployerCtcChartPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <PageHeader
        title="CTC Chart"
        description="What a shift really costs: the wage plus PF, ESI, bonus, ex gratia, leave salary and gratuity, and the cost of longer days and overtime."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Payroll', href: '/employer/payroll' }, { label: 'CTC Chart' }]}
      />
      <CtcChart />
    </div>
  );
}
