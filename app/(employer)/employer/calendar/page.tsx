import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PanelCalendar } from '@/components/calendar/panel-calendar';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function EmployerCalendarPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Your company&apos;s dates in one month view: the audits scheduled at your establishments, the compliance
          documents falling due, the payroll periods closing and the holidays that apply to you. Declaring a holiday or
          adding an event is an administrator&apos;s job — ask your compliance manager and it appears here.
        </p>
      </header>
      <PanelCalendar
        variant="employer"
        overviewEndpoint="/api/employer/calendar"
        canCreate={false}
        canEdit={false}
        canDelete={false}
        withRegister={false}
      />
    </div>
  );
}
