'use client';

/**
 * One event, in full — and the actions that belong to it.
 *
 * Read from the row the register already holds, so opening an event costs no
 * round trip. Status moves live here rather than in the table row, because
 * cancelling or completing is a decision you take after reading the details.
 */
import { Modal } from '@/components/ui/modal';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/dates';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '@/lib/validations/calendar.validation';
import type { EventFormValue } from '@/components/calendar/event-form-modal';

export interface EventDetail extends EventFormValue {
  id: number;
  status?: string;
  company_name?: string | null;
  unit_name?: string | null;
  assignment_number?: string | null;
  auditor_name?: string | null;
  created_by_first?: string | null;
  created_by_last?: string | null;
  reminder_sent?: boolean;
  created_at?: string;
  updated_at?: string;
}

const STATUS_TONE: Record<string, 'success' | 'slate' | 'danger' | 'warning'> = {
  scheduled: 'success',
  completed: 'slate',
  cancelled: 'danger',
  rescheduled: 'warning',
};

function reminderLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'No reminder';
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} day(s) before`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour(s) before`;
  return `${minutes} minute(s) before`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <p className="w-36 shrink-0 text-[12px] uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="min-w-0 flex-1 text-[13px] text-ink">{value || '—'}</div>
    </div>
  );
}

export function EventDetailModal({
  open,
  event,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onAction,
}: {
  open: boolean;
  event: EventDetail | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAction: (action: 'complete' | 'cancel' | 'reschedule' | 'delete') => void;
}) {
  if (!event) return null;
  const status = String(event.status ?? 'scheduled');
  const colour = event.color ?? EVENT_TYPE_COLORS[event.event_type] ?? '#64748b';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={event.title}
      description={`${EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} · EVT-${event.id}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && status !== 'completed' && status !== 'cancelled' && (
              <Button size="sm" onClick={() => onAction('complete')}>Mark complete</Button>
            )}
            {canEdit && status !== 'cancelled' && (
              <Button size="sm" variant="outline" onClick={() => onAction('cancel')}>Cancel event</Button>
            )}
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => onAction('reschedule')}>Reschedule</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button size="sm" variant="danger" onClick={() => onAction('delete')}>Remove</Button>
            )}
            {canEdit && event.assignment_id && (
              <LinkButton href={`/admin/audit-assignments/${event.assignment_id}`} size="sm" variant="outline">Open the audit</LinkButton>
            )}
            {canEdit && <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? 'slate'} dot>{status}</Badge>
          <Badge tone={event.priority === 'Urgent' ? 'danger' : event.priority === 'High' ? 'warning' : 'brand'}>{event.priority}</Badge>
          <Badge tone="slate">{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</Badge>
          <Badge tone="slate">{event.visibility === 'all' ? 'Visible to everyone' : `Visible to ${event.visibility}`}</Badge>
          <span className="ml-1 h-3 w-3 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
        </div>

        {event.description && <p className="whitespace-pre-line text-[13px] text-ink-soft">{event.description}</p>}

        <div className="divide-y divide-line rounded-lg border border-line px-4">
          <Row label="Starts" value={formatDateTime(event.start_datetime)} />
          <Row label="Ends" value={event.end_datetime ? formatDateTime(event.end_datetime) : 'Same day'} />
          <Row label="All day" value={Boolean(Number(event.all_day)) ? 'Yes' : 'No'} />
          <Row label="Company" value={event.company_name ?? 'Platform-wide'} />
          <Row label="Unit" value={event.unit_name ?? null} />
          <Row
            label="Audit"
            value={event.assignment_number
              ? `${event.assignment_number}${event.auditor_name ? ` · ${event.auditor_name}` : ''}`
              : null}
          />
          <Row
            label="Location"
            value={event.location
              ? event.meeting_url
                ? <span>{event.location}<br /><a className="text-brand-600 hover:underline" href={event.meeting_url} target="_blank" rel="noreferrer">{event.meeting_url}</a></span>
                : event.location
              : event.meeting_url
                ? <a className="text-brand-600 hover:underline" href={event.meeting_url} target="_blank" rel="noreferrer">{event.meeting_url}</a>
                : null}
          />
          <Row
            label="Attendees"
            value={event.attendees.length ? event.attendees.join(', ') : null}
          />
          <Row
            label="Reminder"
            value={`${reminderLabel(event.reminder_minutes)}${event.reminder_minutes !== null && event.reminder_minutes !== undefined
              ? event.reminder_sent ? ' — already sent' : ' — not sent yet'
              : ''}`}
          />
          <Row
            label="Added by"
            value={event.created_by_first
              ? `${event.created_by_first} ${event.created_by_last ?? ''}`.trim()
              : 'The system'}
          />
          {event.created_at && <Row label="Recorded" value={formatDateTime(event.created_at)} />}
          {event.updated_at && <Row label="Last change" value={formatDateTime(event.updated_at)} />}
        </div>
      </div>
    </Modal>
  );
}
