import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { LeaveMonitor } from '@/components/payroll/leave-monitor';

export const metadata: Metadata = { title: 'Leave Monitoring' };
export const dynamic = 'force-dynamic';

export default async function LeaveMonitoringPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Leave Monitoring</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Leave across the platform: the applications awaiting a decision, the ledger that holds every employee's balance, and the leave types each establishment grants. Approving an application moves the balance and marks the days as Leave in attendance; refusing leaves both untouched.
        </p>
      </header>
      <LeaveMonitor
        panel="admin"
        canDecide={hasPermission(user.permissions, 'leave.approve')}
        canCreate={hasPermission(user.permissions, 'leave.create')}
      />
    </div>
  );
}
