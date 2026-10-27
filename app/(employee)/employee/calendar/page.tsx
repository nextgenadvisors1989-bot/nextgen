import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PanelCalendar } from '@/components/calendar/panel-calendar';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function EmployeeCalendarPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The holidays the establishment observes and the leave you have been granted, month by month. The working days
          between them are the days attendance counts, so this is also where you check whether a date is a working day
          before you apply for leave.
        </p>
      </header>
      <PanelCalendar
        variant="employee"
        overviewEndpoint="/api/employee/calendar"
        canCreate={false}
        canEdit={false}
        canDelete={false}
        withRegister={false}
      />
    </div>
  );
}
