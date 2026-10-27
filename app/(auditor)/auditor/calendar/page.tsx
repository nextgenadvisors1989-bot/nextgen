import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { PanelCalendar } from '@/components/calendar/panel-calendar';
import { MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';

export const metadata: Metadata = { title: 'My Calendar' };
export const dynamic = 'force-dynamic';

export default async function AuditorCalendarPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">My calendar</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Your diary: every audit visit and closing meeting assigned to you, the holidays the establishment observes, and
          any meeting, training day or reminder you add yourself. A reminder you set here is sent to you and to the
          attendees you list before the event starts.
        </p>
      </header>
      <PanelCalendar
        variant="auditor"
        overviewEndpoint="/api/auditor/calendar/overview"
        listEndpoint="/api/auditor/calendar"
        optionsEndpoint="/api/auditor/calendar/options"
        allowedTypes={MANUAL_EVENT_TYPES}
        canCreate={hasPermission(user.permissions, 'calendar.create')}
        canEdit={hasPermission(user.permissions, 'calendar.update')}
        canDelete={hasPermission(user.permissions, 'calendar.delete')}
        withRegister
      />
    </div>
  );
}
