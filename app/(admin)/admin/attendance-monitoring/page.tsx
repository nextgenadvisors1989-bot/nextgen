import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { AttendanceMonitor } from '@/components/payroll/attendance-monitor';

export const metadata: Metadata = { title: 'Attendance Monitoring' };
export const dynamic = 'force-dynamic';

export default async function AttendanceMonitoringPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Attendance Monitoring</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          The days every company's payroll counts. Mark a day when the register is kept by hand, mark a whole month in one pass when the establishment runs on a default shift, and correct the absences and overtime hours afterwards — the payroll engine reads exactly what is recorded here.
        </p>
      </header>
      <AttendanceMonitor
        panel="admin"
        canCreate={hasPermission(user.permissions, 'attendance.create')}
        canBulk={hasPermission(user.permissions, 'attendance.upload')}
      />
    </div>
  );
}
