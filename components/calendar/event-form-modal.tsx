'use client';

/**
 * Create / edit an event.
 *
 * One form for both, because an event is the same shape either way. The fields
 * follow the register: what it is (type, title, priority), when it is (start,
 * end, all-day), who it concerns (employer, unit, audit, auditor, attendees) and
 * how it should be remembered (reminder lead time, colour, visibility).
 *
 * Only the event types the panel is allowed to author are offered — audit dates
 * and closing meetings are written by the assignment module when an audit is
 * assigned, never by hand — and the type list is passed in by the panel so the
 * same component serves the admin and auditor screens.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import {
  EVENT_TYPE_LABELS, EVENT_PRIORITIES, EVENT_VISIBILITIES, REMINDER_CHOICES,
} from '@/lib/validations/calendar.validation';

export interface CalendarOption {
  value: string;
  label: string;
  hint?: string;
  employerId?: number;
}

export interface EventFormValue {
  id?: number;
  title: string;
  description: string | null;
  event_type: string;
  employer_id: number | null;
  unit_id: number | null;
  assignment_id: number | null;
  auditor_id: number | null;
  start_datetime: string;
  end_datetime: string | null;
  all_day: number | boolean;
  location: string | null;
  meeting_url: string | null;
  attendees: string[];
  reminder_minutes: number | null;
  color: string | null;
  priority: string;
  visibility: string;
  status?: string;
}

function splitDateTime(value: string | null): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date, time = ''] = String(value).replace('T', ' ').split(' ');
  return { date: date.slice(0, 10), time: time.slice(0, 5) };
}

export function EventFormModal({
  open,
  onClose,
  onSaved,
  mode,
  event,
  allowedTypes,
  options,
  endpoint = '/api/admin/calendar',
  variant = 'admin',
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: 'create' | 'edit';
  event?: EventFormValue | null;
  /** The event types this panel may author. */
  allowedTypes: readonly string[];
  options: {
    employers: CalendarOption[];
    units: CalendarOption[];
    auditors: CalendarOption[];
    assignments: CalendarOption[];
  };
  /** The register the event belongs to: `/api/admin/calendar` or `/api/auditor/calendar`. */
  endpoint?: string;
  /** An auditor files events against their own audits only. */
  variant?: 'admin' | 'auditor';
}) {
  const { success, error: errorToast } = useToast();
  const start = splitDateTime(event?.start_datetime ?? null);
  const end = splitDateTime(event?.end_datetime ?? null);

  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    event_type: event?.event_type ?? allowedTypes[0] ?? 'MEETING',
    employer_id: event?.employer_id ? String(event.employer_id) : '',
    unit_id: event?.unit_id ? String(event.unit_id) : '',
    assignment_id: event?.assignment_id ? String(event.assignment_id) : '',
    auditor_id: event?.auditor_id ? String(event.auditor_id) : '',
    start_date: start.date,
    start_time: start.time || '09:00',
    end_date: end.date,
    end_time: end.time,
    all_day: Boolean(Number(event?.all_day ?? 0)),
    location: event?.location ?? '',
    meeting_url: event?.meeting_url ?? '',
    attendees: (event?.attendees ?? []).join(', '),
    reminder_minutes: event?.reminder_minutes === null || event?.reminder_minutes === undefined
      ? ''
      : String(event.reminder_minutes),
    priority: event?.priority ?? 'Medium',
    visibility: event?.visibility ?? 'all',
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // The modal is reused for every row: start from the row in front of the user.
  useEffect(() => {
    if (!open) return;
    const nextStart = splitDateTime(event?.start_datetime ?? null);
    const nextEnd = splitDateTime(event?.end_datetime ?? null);
    setForm({
      title: event?.title ?? '',
      description: event?.description ?? '',
      event_type: event?.event_type ?? allowedTypes[0] ?? 'MEETING',
      employer_id: event?.employer_id ? String(event.employer_id) : '',
      unit_id: event?.unit_id ? String(event.unit_id) : '',
      assignment_id: event?.assignment_id ? String(event.assignment_id) : '',
      auditor_id: event?.auditor_id ? String(event.auditor_id) : '',
      start_date: nextStart.date,
      start_time: nextStart.time || '09:00',
      end_date: nextEnd.date,
      end_time: nextEnd.time,
      all_day: Boolean(Number(event?.all_day ?? 0)),
      location: event?.location ?? '',
      meeting_url: event?.meeting_url ?? '',
      attendees: (event?.attendees ?? []).join(', '),
      reminder_minutes: event?.reminder_minutes === null || event?.reminder_minutes === undefined
        ? ''
        : String(event.reminder_minutes),
      priority: event?.priority ?? 'Medium',
      visibility: event?.visibility ?? 'all',
    });
    setIssues({});
  }, [open, event, allowedTypes]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  const unitOptions = options.units.filter(
    (unit) => !form.employer_id || unit.employerId === Number(form.employer_id)
  );

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        event_type: form.event_type,
        employer_id: form.employer_id ? Number(form.employer_id) : null,
        unit_id: form.unit_id ? Number(form.unit_id) : null,
        assignment_id: form.assignment_id ? Number(form.assignment_id) : null,
        auditor_id: form.auditor_id ? Number(form.auditor_id) : null,
        start_datetime: `${form.start_date} ${form.all_day ? '00:00' : form.start_time || '09:00'}`,
        end_datetime: form.end_date ? `${form.end_date} ${form.end_time || (form.all_day ? '23:59' : '10:00')}` : null,
        all_day: form.all_day,
        location: form.location || null,
        meeting_url: form.meeting_url || null,
        attendees: form.attendees
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        reminder_minutes: form.reminder_minutes === '' ? null : Number(form.reminder_minutes),
        priority: form.priority,
        visibility: form.visibility,
      };

      const result = mode === 'create'
        ? await api.post(endpoint, payload)
        : await api.put(`${endpoint}/${event?.id}`, payload);

      if (!result.ok) {
        const mapped: Record<string, string> = {};
        if (Array.isArray(result.errors)) {
          for (const issue of result.errors) mapped[issue.field] = issue.message;
        }
        setIssues(mapped);
        errorToast(result.message);
        return;
      }

      success(result.message);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={mode === 'create' ? 'New calendar event' : `Edit “${event?.title ?? 'event'}”`}
      description="Meetings, training days, inspections and reminders you keep yourself. Audit dates and closing meetings are written by the audit module."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!form.title || !form.start_date}>
            {mode === 'create' ? 'Add to calendar' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Title" required value={form.title} error={issues.title}
            placeholder="Safety committee meeting"
            onChange={(event) => set('title', event.target.value)}
          />
          <Select
            label="Type" value={form.event_type}
            onChange={(value) => set('event_type', value)}
            options={allowedTypes.map((type) => ({ value: type, label: EVENT_TYPE_LABELS[type] ?? type }))}
          />
        </div>

        <Textarea
          label="Description" rows={3} value={form.description}
          helper="What the meeting or session covers, and anything the attendees need to bring."
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => set('description', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label="Starts on" required value={form.start_date} error={issues.start_datetime}
            onChange={(value) => { set('start_date', value); if (!form.end_date) set('end_date', value); }}
          />
          <Input
            label="Start time" type="time" value={form.start_time} disabled={form.all_day}
            onChange={(event) => set('start_time', event.target.value)}
          />
          <DatePicker
            label="Ends on" value={form.end_date} error={issues.end_datetime}
            helper="Leave empty for a single-day event."
            onChange={(value) => set('end_date', value)}
          />
          <Input
            label="End time" type="time" value={form.end_time} disabled={form.all_day}
            onChange={(event) => set('end_time', event.target.value)}
          />
        </div>

        <Checkbox
          label="All day — the calendar shows it without a time"
          checked={form.all_day}
          onChange={(event) => set('all_day', event.target.checked)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {variant === 'admin' && (
            <>
              <Select
                label="Company" value={form.employer_id} error={issues.employer_id}
                helper="Leave empty for a platform-wide event."
                onChange={(value) => { set('employer_id', value); set('unit_id', ''); }}
                options={[{ value: '', label: 'Every company' }, ...options.employers]}
              />
              <Select
                label="Unit" value={form.unit_id} error={issues.unit_id}
                disabled={!form.employer_id}
                onChange={(value) => set('unit_id', value)}
                options={[
                  { value: '', label: form.employer_id ? 'Every unit' : 'Choose a company first' },
                  ...unitOptions,
                ]}
              />
            </>
          )}
          <Select
            label="Audit" value={form.assignment_id} error={issues.assignment_id}
            helper={variant === 'auditor'
              ? 'Your own open audits. The event then shows on that assignment.'
              : 'Ties the event to an audit so it shows on that assignment.'}
            onChange={(value) => set('assignment_id', value)}
            options={[
              { value: '', label: variant === 'auditor' ? 'Not tied to an audit' : 'Not tied to an audit' },
              ...options.assignments,
            ]}
          />
          {variant === 'admin' && (
            <Select
              label="Auditor" value={form.auditor_id} error={issues.auditor_id}
              onChange={(value) => set('auditor_id', value)}
              options={[{ value: '', label: 'No auditor' }, ...options.auditors]}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Location" value={form.location} placeholder="Head office — conference room 2"
            onChange={(event) => set('location', event.target.value)}
          />
          <Input
            label="Meeting link" value={form.meeting_url} placeholder="https://meet.example.com/abc-defg"
            onChange={(event) => set('meeting_url', event.target.value)}
          />
        </div>

        <Input
          label="Attendees" value={form.attendees}
          helper="Email addresses, separated by commas. Everyone listed gets the reminder."
          onChange={(event) => set('attendees', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Remind before" value={form.reminder_minutes}
            helper="Sent in-app and by email to the audience above."
            onChange={(value) => set('reminder_minutes', value)}
            options={[
              { value: '', label: 'No reminder' },
              ...REMINDER_CHOICES.map((choice) => ({ value: String(choice.value), label: choice.label })),
            ]}
          />
          <Select
            label="Priority" value={form.priority}
            onChange={(value) => set('priority', value)}
            options={EVENT_PRIORITIES.map((priority) => ({ value: priority, label: priority }))}
          />
          <Select
            label="Who can see it" value={form.visibility}
            onChange={(value) => set('visibility', value)}
            options={EVENT_VISIBILITIES.map((visibility) => ({
              value: visibility,
              label: visibility === 'all' ? 'Everyone' : visibility === 'employer' ? 'The company' : visibility === 'participants' ? 'Attendees' : 'Only me',
            }))}
          />
        </div>
      </div>
    </Modal>
  );
}
