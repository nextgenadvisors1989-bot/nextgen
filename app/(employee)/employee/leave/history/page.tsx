import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { MyLeave } from '@/components/employee/my-pay';

export const metadata: Metadata = { title: 'Leave History' };
export const dynamic = 'force-dynamic';

export default async function EmployeeLeaveHistoryPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Leave History</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Every leave application you have raised, with the approver's decision and comments beside it. A pending or approved application can be withdrawn from here; withdrawing an approved one puts the days back into your balance.
        </p>
      </header>
      <MyLeave />
    </div>
  );
}
