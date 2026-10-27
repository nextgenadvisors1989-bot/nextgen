import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { AttendanceMonitor } from '@/components/payroll/attendance-monitor';

export const metadata: Metadata = { title: 'Attendance Register' };
export const dynamic = 'force-dynamic';

export default async function EmployerAttendancePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Attendance Register</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          The days your payroll counts. Correct an individual day here (marking the same employee and date again fixes that day rather than adding a second record), or open Bulk Attendance to mark a whole month in one pass. Weekly offs and the holidays declared for your company are filled from the calendar, so a Sunday is never counted as an absence.
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
