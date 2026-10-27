import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { CalendarScreen } from '@/components/calendar/calendar-screen';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Every date the platform keeps in one month view: the meetings, training days and inspections you add here, the
          audit visits and closing meetings written by the audit module, the compliance documents falling due, the payroll
          periods closing and the holidays the establishment observes. Reminders go out in-app and by email before an event
          starts, and the same rows drive the working-day count payroll uses.
        </p>
      </header>
      <CalendarScreen
        canCreate={hasPermission(user.permissions, 'calendar.create')}
        canEdit={hasPermission(user.permissions, 'calendar.update')}
        canDelete={hasPermission(user.permissions, 'calendar.delete')}
        canExport={hasPermission(user.permissions, 'calendar.export')}
      />
    </div>
  );
}
