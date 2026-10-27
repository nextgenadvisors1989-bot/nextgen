import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { MyAttendance } from '@/components/employee/my-pay';

export const metadata: Metadata = { title: 'My Attendance' };
export const dynamic = 'force-dynamic';

export default async function EmployeeAttendancePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">My Attendance</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          The days marked for you, month by month — the same record payroll computes your wages on. Present days, leave, holidays, weekly offs and any overtime are totalled above the table. If a day is wrong, raise it with your supervisor before payroll is run: the correction is what will be paid.
        </p>
      </header>
      <MyAttendance />
    </div>
  );
}
