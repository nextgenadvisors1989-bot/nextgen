import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { LeaveMonitor } from '@/components/payroll/leave-monitor';

export const metadata: Metadata = { title: 'Leave Ledger' };
export const dynamic = 'force-dynamic';

export default async function EmployerLeaveLedgerPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Leave Ledger</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Every employee's leave balance and the applications behind it. Approve or refuse an application from here — an approval moves the ledger balance and marks the days as Leave in attendance, which is what payroll reads. The ledger also accrues a year's entitlement for the whole company in one action.
        </p>
      </header>
      <LeaveMonitor
        panel="employer"
        canDecide={hasPermission(user.permissions, 'leave.approve')}
        canCreate={hasPermission(user.permissions, 'leave.create')}
      />
    </div>
  );
}
