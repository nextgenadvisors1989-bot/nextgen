import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { MyLeave } from '@/components/employee/my-pay';

export const metadata: Metadata = { title: 'Leave' };
export const dynamic = 'force-dynamic';

export default async function EmployeeLeavePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Leave</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Your leave balance and the form to apply for more. Weekly offs and the holidays declared for your company that fall inside your dates are not counted as leave, and the application is checked against your balance before it is submitted — so what you see here is what your approver sees.
        </p>
      </header>
      <MyLeave />
    </div>
  );
}
