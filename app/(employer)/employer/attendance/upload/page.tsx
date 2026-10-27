import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { AttendanceMonitor } from '@/components/payroll/attendance-monitor';

export const metadata: Metadata = { title: 'Bulk Attendance' };
export const dynamic = 'force-dynamic';

export default async function EmployerBulkAttendancePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Bulk Attendance</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          Mark a month for the whole company, one unit or one department in a single pass: every working day takes the default status, and the declared holidays and weekly offs are filled in from the calendar. Existing marks are updated rather than duplicated, so re-running a month after a correction is safe.
        </p>
      </header>
      <AttendanceMonitor
        panel="employer"
        canCreate={hasPermission(user.permissions, 'attendance.create')}
        canBulk={hasPermission(user.permissions, 'attendance.upload')}
      />
    </div>
  );
}
