/**
 * Calendar & holiday master business rules.
 *
 * Three ideas run through this service:
 *
 *   1. **One calendar, many authors.** Audit dates and closing meetings arrive
 *      from the assignment module, compliance expiries are derived from the
 *      documents register, payroll periods from the payroll engine. What a human
 *      creates here is a meeting, a training session or an inspection — and the
 *      agenda merges them all without copying any of them.
 *   2. **Scope is enforced, not filtered away.** An auditor's calendar is built
 *      from `auditor_id = <them>`, an employer's from `employer_id = <them>`, at
 *      the query level — a panel cannot widen its own view by editing a URL.
 *   3. **The holiday master is the establishment's legal calendar.** Leave and
 *      payroll both count against it, so a holiday is validated, deduplicated and
 *      never quietly overwritten.
 */
import { randomUUID } from 'node:crypto';
import * as repo from '@/repositories/calendar.repository';
import { writeActivityLog } from '@/lib/logger/activity-log';
import {
  calendarEventListQuerySchema,
  calendarEventSchema,
  calendarWindowQuerySchema,
  holidayListQuerySchema,
  holidaySchema,
  nationalHolidaySchema,
  monthBounds,
  toIsoDay,
  EVENT_TYPE_LABELS,
  NATIONAL_HOLIDAYS,
} from '@/lib/validations/calendar.validation';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';

export interface ActorContext {
  user: { id: number; fullName: string; primaryRole: string; employerId?: number | null };
  ip?: string | null;
  userAgent?: string | null;
}

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };

const notFound = (resource: string): ServiceError => Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const conflict = (code: string, message: string): ServiceError => Object.assign(new Error(message), { code });
const validationFailed = (issues: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error('Please correct the highlighted fields'), { code: 'VALIDATION_FAILED', issues });

function actorFields(actor: ActorContext) {
  return {
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId ?? null,
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

/** `2026-10-07 09:30:00` from the schema's normalised `YYYY-MM-DD HH:MM`. */
function toSqlDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

/** One entry, however it was typed, becomes a `{ name, email }` record. */
function attendeeObject(entry: unknown): { name: string; email?: string } | null {
  if (typeof entry === 'string') {
    const value = entry.trim();
    if (!value) return null;
    return /@/.test(value) ? { name: value.split('@')[0], email: value } : { name: value };
  }
  if (entry && typeof entry === 'object') {
    const record = entry as { name?: unknown; email?: unknown };
    const name = record.name === undefined || record.name === null ? '' : String(record.name).trim();
    const email = record.email === undefined || record.email === null ? '' : String(record.email).trim();
    if (!name && !email) return null;
    return email ? { name: name || email.split('@')[0], email } : { name };
  }
  return null;
}

function parseAttendees(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const entries = raw.map(attendeeObject).filter(Boolean) as { name: string; email?: string }[];
    return entries.length ? JSON.stringify(entries.slice(0, 50)) : null;
  }
  if (typeof raw === 'string' && raw.trim()) {
    // A pasted list of names/emails is accepted as one attendee per line.
    if (raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch {
        /* fall through to the line-based parse */
      }
    }
    const entries = raw
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(attendeeObject)
      .filter(Boolean) as { name: string; email?: string }[];
    return entries.length ? JSON.stringify(entries.slice(0, 50)) : null;
  }
  return null;
}

function parseAttendeesOut(raw: unknown): { name: string; email?: string }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as { name: string; email?: string }[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as { name: string; email?: string }[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function shapeEvent(row: RowDataPacket) {
  return {
    ...row,
    id: Number(row.id),
    employer_id: row.employer_id === null ? null : Number(row.employer_id),
    unit_id: row.unit_id === null ? null : Number(row.unit_id),
    assignment_id: row.assignment_id === null ? null : Number(row.assignment_id),
    auditor_id: row.auditor_id === null ? null : Number(row.auditor_id),
    all_day: Boolean(Number(row.all_day)),
    reminder_sent: Boolean(Number(row.reminder_sent)),
    reminder_minutes: row.reminder_minutes === null ? null : Number(row.reminder_minutes),
    attendees: parseAttendeesOut(row.attendees_json),
    type_label: EVENT_TYPE_LABELS[String(row.event_type)] ?? String(row.event_type),
    starts_at: String(row.start_datetime),
    ends_at: row.end_datetime ? String(row.end_datetime) : null,
  };
}

/* ══════════════════════════════════ events ═══════════════════════════════ */

export async function listEvents(filters: repo.EventListFilters) {
  const [result, stats] = await Promise.all([repo.findEvents(filters), repo.eventStats(filters.scope)]);
  return { ...result, stats, data: result.data.map((row) => shapeEvent(row)) };
}

export async function getEvent(eventId: number) {
  const row = await repo.findEventById(eventId);
  if (!row) throw notFound('Event');
  return shapeEvent(row);
}

/** An auditor may only touch the events that belong to it; an employer, its own. */
async function assertEventScope(
  eventId: number,
  scope?: { auditorId?: number | null; employerId?: number | null }
): Promise<void> {
  if (!scope?.auditorId && !scope?.employerId) return;
  const row = await repo.findEventById(eventId);
  if (!row) throw notFound('Event');
  if (scope.auditorId && Number(row.auditor_id) !== scope.auditorId) {
    throw Object.assign(new Error('That event belongs to another auditor'), { code: 'FORBIDDEN' });
  }
  if (scope.employerId && row.employer_id !== null && Number(row.employer_id) !== scope.employerId) {
    throw Object.assign(new Error('That event belongs to another employer'), { code: 'FORBIDDEN' });
  }
}

export async function createEvent(
  payload: unknown,
  actor: ActorContext,
  options: { allowedTypes?: readonly string[]; scope?: { auditorId?: number | null; employerId?: number | null } } = {}
) {
  const input = calendarEventSchema.parse(payload);

  if (options.allowedTypes && !options.allowedTypes.includes(input.event_type)) {
    throw validationFailed([
      { field: 'event_type', message: `${EVENT_TYPE_LABELS[input.event_type] ?? input.event_type} events are created by the module that owns them` },
    ]);
  }
  if (options.scope?.auditorId) {
    // An auditor's events always belong to the auditor and, when given, to one of
    // its own assignments — never to an arbitrary employer.
    input.auditor_id = options.scope.auditorId;
    if (input.assignment_id) {
      const assignment = await queryOne<RowDataPacket>(
        `SELECT id FROM audit_assignments WHERE id = ? AND auditor_id = ? AND deleted_at IS NULL LIMIT 1`,
        [input.assignment_id, options.scope.auditorId]
      );
      if (!assignment) {
        throw validationFailed([{ field: 'assignment_id', message: 'That audit is not assigned to you' }]);
      }
    }
  }
  if (options.scope?.employerId) {
    input.employer_id = options.scope.employerId;
  }

  await assertReferences(input);

  const eventId = await repo.insertEvent({
    uuid: randomUUID(),
    title: input.title,
    description: input.description ?? null,
    eventType: input.event_type,
    employerId: input.employer_id ?? null,
    unitId: input.unit_id ?? null,
    assignmentId: input.assignment_id ?? null,
    auditorId: input.auditor_id ?? null,
    createdBy: actor.user.id,
    startDatetime: toSqlDateTime(input.start_datetime),
    endDatetime: input.end_datetime ? toSqlDateTime(input.end_datetime) : null,
    allDay: Boolean(input.all_day),
    location: input.location ?? null,
    meetingUrl: input.meeting_url ?? null,
    attendeesJson: parseAttendees(input.attendees),
    reminderMinutes: input.reminder_minutes ?? null,
    color: input.color ?? null,
    priority: input.priority,
    status: input.status,
    visibility: input.visibility,
    recurrenceRule: input.recurrence_rule ?? null,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'calendar',
    entityType: 'calendar_event',
    entityId: eventId,
    entityLabel: input.title,
    description: `Calendar event “${input.title}” (${EVENT_TYPE_LABELS[input.event_type] ?? input.event_type}) added for ${input.start_datetime}`,
    newValues: {
      title: input.title,
      event_type: input.event_type,
      start_datetime: input.start_datetime,
      priority: input.priority,
      status: input.status,
    },
  });

  return { id: eventId, title: input.title, start_datetime: input.start_datetime, event_type: input.event_type };
}

async function assertReferences(input: {
  employer_id?: number | null;
  unit_id?: number | null;
  auditor_id?: number | null;
  assignment_id?: number | null;
}) {
  if (input.employer_id) {
    const employer = await queryOne<RowDataPacket>(
      'SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.employer_id]
    );
    if (!employer) throw validationFailed([{ field: 'employer_id', message: 'That employer does not exist' }]);
  }
  if (input.unit_id) {
    const unit = await queryOne<RowDataPacket>(
      'SELECT id, employer_id FROM company_units WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.unit_id]
    );
    if (!unit) throw validationFailed([{ field: 'unit_id', message: 'That unit does not exist' }]);
    if (input.employer_id && Number(unit.employer_id) !== input.employer_id) {
      throw validationFailed([{ field: 'unit_id', message: 'That unit belongs to a different employer' }]);
    }
  }
  if (input.auditor_id) {
    const auditor = await queryOne<RowDataPacket>(
      'SELECT id FROM auditors WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.auditor_id]
    );
    if (!auditor) throw validationFailed([{ field: 'auditor_id', message: 'That auditor does not exist' }]);
  }
  if (input.assignment_id) {
    const assignment = await queryOne<RowDataPacket>(
      'SELECT id FROM audit_assignments WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [input.assignment_id]
    );
    if (!assignment) throw validationFailed([{ field: 'assignment_id', message: 'That audit does not exist' }]);
  }
}

export async function updateEvent(
  eventId: number,
  payload: unknown,
  actor: ActorContext,
  scope?: { auditorId?: number | null; employerId?: number | null },
  options: { allowedTypes?: readonly string[] } = {}
) {
  await assertEventScope(eventId, scope);
  const current = await repo.findEventById(eventId);
  if (!current) throw notFound('Event');

  const input = calendarEventSchema.parse({ ...(payload as Record<string, unknown>) });
  // A module-owned event (an audit date, a payroll period) can have its details
  // edited — its time, its place — but it cannot be *retyped* by hand: the row
  // would then claim an origin it does not have.
  if (options.allowedTypes && !options.allowedTypes.includes(input.event_type)
      && input.event_type !== String(current.event_type)) {
    throw validationFailed([
      {
        field: 'event_type',
        message: `${EVENT_TYPE_LABELS[input.event_type] ?? input.event_type} events are created by the module that owns them`,
      },
    ]);
  }
  if (scope?.auditorId) input.auditor_id = scope.auditorId;
  if (scope?.employerId) input.employer_id = scope.employerId;
  await assertReferences(input);

  const mapped: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    event_type: input.event_type,
    employer_id: input.employer_id ?? null,
    unit_id: input.unit_id ?? null,
    assignment_id: input.assignment_id ?? null,
    auditor_id: input.auditor_id ?? null,
    start_datetime: toSqlDateTime(input.start_datetime),
    end_datetime: input.end_datetime ? toSqlDateTime(input.end_datetime) : null,
    all_day: input.all_day ? 1 : 0,
    location: input.location ?? null,
    meeting_url: input.meeting_url ?? null,
    attendees_json: parseAttendees(input.attendees),
    reminder_minutes: input.reminder_minutes ?? null,
    color: input.color ?? null,
    priority: input.priority,
    status: input.status,
    visibility: input.visibility,
    recurrence_rule: input.recurrence_rule ?? null,
  };

  const fields: Record<string, string | number | null> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(mapped)) {
    const previous = current[key as keyof RowDataPacket] ?? null;
    const normalised = value === null || value === undefined ? null : value;
    const before = previous === null ? null : typeof previous === 'object' ? JSON.stringify(previous) : previous;
    if (String(before ?? '') === String(normalised ?? '')) continue;
    fields[key] = normalised as string | number | null;
    changed[key] = { from: previous, to: normalised };
  }

  if (!Object.keys(fields).length) throw conflict('NO_CHANGE', 'Nothing about this event has changed');

  // A moved event is re-armed: the reminder must be able to fire again, and a
  // rescheduled meeting that was marked done is no longer done.
  if (fields.start_datetime || fields.end_datetime || fields.reminder_minutes !== undefined) {
    fields.reminder_sent = 0;
    if (!fields.status && String(current.status) === 'completed') fields.status = 'scheduled';
  }

  await repo.updateEvent(eventId, fields);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'calendar',
    entityType: 'calendar_event',
    entityId: eventId,
    entityLabel: String(current.title),
    description: `Calendar event “${current.title}” updated (${Object.keys(changed).join(', ')})`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });

  return { id: eventId, changed: Object.keys(changed) };
}

export async function deleteEvent(
  eventId: number,
  payload: { confirm?: boolean; reason?: string | null },
  actor: ActorContext,
  scope?: { auditorId?: number | null; employerId?: number | null }
) {
  await assertEventScope(eventId, scope);
  const event = await repo.findEventById(eventId);
  if (!event) throw notFound('Event');

  // An event that another module owns is not the calendar's to delete: the audit
  // date disappears when the audit does, and the register stays consistent.
  const systemTypes = ['AUDIT', 'AUDIT_END_MEETING', 'COMPLIANCE_EXPIRY', 'PAYROLL_RUN', 'LEAVE'];
  if (systemTypes.includes(String(event.event_type)) && !payload?.confirm) {
    throw conflict(
      'IN_USE',
      `“${event.title}” was created by the ${EVENT_TYPE_LABELS[String(event.event_type)] ?? 'owning'} module — cancel it there, or confirm to remove it from the calendar alone`
    );
  }

  await repo.softDeleteEvent(eventId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'calendar',
    entityType: 'calendar_event',
    entityId: eventId,
    entityLabel: String(event.title),
    description: `Calendar event “${event.title}” removed from the calendar${payload?.reason ? ` — ${payload.reason}` : ''}`,
    oldValues: {
      title: event.title,
      event_type: event.event_type,
      start_datetime: event.start_datetime,
      status: event.status,
    },
  });
  return { id: eventId };
}

export async function setEventStatus(
  eventId: number,
  status: string,
  actor: ActorContext,
  scope?: { auditorId?: number | null; employerId?: number | null }
) {
  await assertEventScope(eventId, scope);
  const event = await repo.findEventById(eventId);
  if (!event) throw notFound('Event');
  if (String(event.status) === status) {
    throw conflict('INVALID_STATE', `That event is already ${status}`);
  }
  await repo.updateEvent(eventId, { status });
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'calendar',
    entityType: 'calendar_event',
    entityId: eventId,
    entityLabel: String(event.title),
    description: `Calendar event “${event.title}” marked ${status}`,
    oldValues: { status: event.status },
    newValues: { status },
  });
  return { id: eventId, status };
}

/* ══════════════════════════════════ agenda ═══════════════════════════════ */

export interface AgendaEntry {
  id: string;
  date: string;
  time: string | null;
  kind: string;
  type_label: string;
  title: string;
  detail: string | null;
  reference: string | null;
  href: string | null;
  status: string | null;
  priority: string | null;
  tone: string;
  employer: string | null;
  source: 'event' | 'expiry' | 'payroll' | 'holiday' | 'leave';
}

/**
 * Where a merged agenda row points, per panel.
 *
 * The agenda merges five registers, and each register has a screen of its own in
 * the panel that owns it — so the link travels with the row. A cell that is
 * `null` means the reader can see the row but has no screen for that register
 * (an auditor has no payroll or leave book), and the row renders as plain text.
 */
const AGENDA_HREFS: Record<string, Record<string, string | null>> = {
  event: { admin: '/admin/calendar', auditor: '/auditor/calendar', employer: '/employer/calendar', employee: '/employee/calendar' },
  expiry: { admin: '/admin/compliance/documents', employer: '/employer/compliance-documents', auditor: null, employee: null },
  payroll: { admin: '/admin/payroll-monitoring', employer: '/employer/payroll', auditor: null, employee: null },
  holiday: { admin: '/admin/calendar/holidays', auditor: '/auditor/calendar', employer: '/employer/calendar', employee: '/employee/calendar' },
  leave: { admin: '/admin/leave-monitoring', employer: '/employer/leave-ledger', auditor: null, employee: '/employee/leave' },
};

function agendaHref(source: string, panel: string): string | null {
  return AGENDA_HREFS[source]?.[panel] ?? null;
}

function dayOf(value: unknown): string {
  if (!value) return '';
  return value instanceof Date
    ? toIsoDay(value)
    : String(value).slice(0, 10);
}

/**
 * The merged agenda for a window.
 *
 * `scope` decides what the caller may see; `include*` decides what this panel
 * asks for. Both are explicit so a new panel cannot accidentally inherit the
 * platform-wide view.
 */
export async function agenda(
  query: unknown,
  scope: repo.AgendaScope
): Promise<{ from: string; to: string; entries: AgendaEntry[]; counts: { day: string; events: number; holidays: number }[]; days: { events: number; expiries: number; payroll: number; holidays: number; leave: number } }> {
  const input = calendarWindowQuerySchema.parse(query);
  const bounds = monthBounds(input.year, input.month);
  const from = input.from_date || bounds.from;
  const to = input.to_date || bounds.to;

  const employerId = scope.employerId ?? input.employer_id ?? null;
  const auditorId = scope.auditorId ?? input.auditor_id ?? null;
  const panel = scope.panel ?? 'admin';

  const [events, expiries, payroll, holidays, leave, counts] = await Promise.all([
    repo.agendaEvents(from, to, { ...scope, employerId, auditorId }),
    scope.includeExpiries === false ? Promise.resolve([]) : repo.agendaExpiries(from, to, employerId),
    scope.includePayroll === false ? Promise.resolve([]) : repo.agendaPayrollRuns(from, to, employerId),
    scope.includeHolidays === false ? Promise.resolve([]) : repo.agendaHolidays(from, to, employerId),
    scope.includeLeave === false ? Promise.resolve([]) : repo.agendaLeave(from, to, employerId, scope.employeeId ?? null),
    repo.agendaDayCounts(from, to, { ...scope, employerId, auditorId }),
  ]);

  const entries: AgendaEntry[] = [];

  for (const row of events) {
    entries.push({
      id: `event-${row.id}`,
      date: dayOf(row.day),
      time: row.all_day ? null : String(row.time ?? ''),
      kind: String(row.kind),
      type_label: EVENT_TYPE_LABELS[String(row.kind)] ?? String(row.kind),
      title: String(row.title),
      detail: row.location ? String(row.location) : null,
      reference: row.assignment_number ? String(row.assignment_number) : null,
      href: agendaHref('event', panel),
      status: String(row.status),
      priority: String(row.priority),
      tone: String(row.kind),
      employer: row.company_name ? String(row.company_name) : null,
      source: 'event',
    });
  }

  for (const row of expiries) {
    entries.push({
      id: `expiry-${row.id}`,
      date: dayOf(row.day),
      time: null,
      kind: 'COMPLIANCE_EXPIRY',
      type_label: EVENT_TYPE_LABELS.COMPLIANCE_EXPIRY,
      title: `${String(row.title)} expires`,
      detail: row.document_type ? String(row.document_type) : null,
      reference: String(row.compliance_status ?? ''),
      href: agendaHref('expiry', panel),
      status: String(row.compliance_status ?? ''),
      priority: null,
      tone: 'COMPLIANCE_EXPIRY',
      employer: row.company_name ? String(row.company_name) : null,
      source: 'expiry',
    });
  }

  for (const row of payroll) {
    entries.push({
      id: `payroll-${row.id}`,
      date: dayOf(row.day),
      time: null,
      kind: 'PAYROLL_RUN',
      type_label: EVENT_TYPE_LABELS.PAYROLL_RUN,
      title: `Payroll ${String(row.run_number)} — period ends`,
      detail: `${Number(row.total_employees ?? 0)} employee(s)`,
      reference: String(row.status ?? ''),
      href: agendaHref('payroll', panel),
      status: String(row.status ?? ''),
      priority: null,
      tone: 'PAYROLL_RUN',
      employer: row.company_name ? String(row.company_name) : null,
      source: 'payroll',
    });
  }

  for (const row of holidays) {
    entries.push({
      id: `holiday-${row.id}`,
      date: dayOf(row.day),
      time: null,
      kind: 'HOLIDAY',
      type_label: EVENT_TYPE_LABELS.HOLIDAY,
      title: String(row.title),
      detail: Number(row.is_paid) ? 'Paid holiday' : 'Unpaid holiday',
      reference: String(row.holiday_type ?? ''),
      href: agendaHref('holiday', panel),
      status: null,
      priority: null,
      tone: 'HOLIDAY',
      employer: null,
      source: 'holiday',
    });
  }

  for (const row of leave) {
    entries.push({
      id: `leave-${row.id}`,
      date: dayOf(row.date_from),
      time: null,
      kind: 'LEAVE',
      type_label: EVENT_TYPE_LABELS.LEAVE,
      title: `${String(row.employee_name ?? 'Employee')} on ${String(row.leave_name ?? 'leave')}`,
      detail: `${Number(row.total_days ?? 0)} day(s)`,
      reference: String(row.status ?? ''),
      href: agendaHref('leave', panel),
      status: String(row.status ?? ''),
      priority: null,
      tone: 'LEAVE',
      employer: null,
      source: 'leave',
    });
  }

  entries.sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)));

  return {
    from,
    to,
    entries,
    counts,
    days: {
      events: events.length,
      expiries: expiries.length,
      payroll: payroll.length,
      holidays: holidays.length,
      leave: leave.length,
    },
  };
}

/** The month view used by the screen: the grid counts plus a compact agenda. */
export async function calendarOverview(query: unknown, scope: repo.AgendaScope) {
  const input = calendarWindowQuerySchema.parse(query);
  const [bundle, stats] = await Promise.all([
    agenda(query, scope),
    repo.eventStats({ auditorId: scope.auditorId ?? null, employerId: scope.employerId ?? null }),
  ]);

  const upcoming = await repo.findEvents({
    page: 1,
    limit: 6,
    window: 'upcoming',
    sortBy: 'start_datetime',
    sortDir: 'asc',
    scope: { auditorId: scope.auditorId ?? null, employerId: scope.employerId ?? null },
  });

  return {
    month: input.month,
    year: input.year,
    monthLabel: `${String(input.year)}-${String(input.month).padStart(2, '0')}`,
    counts: bundle.counts,
    days: bundle.days,
    entries: bundle.entries,
    stats,
    upcoming: upcoming.data.map((row) => shapeEvent(row)),
  };
}

/* ═══════════════════════════════════ holidays ════════════════════════════ */

export async function listHolidays(filters: repo.HolidayListFilters) {
  const year = filters.year ?? new Date().getFullYear();
  const [result, stats, years] = await Promise.all([
    repo.findHolidays(filters),
    repo.holidayStats(year, filters.employerId ?? null),
    repo.holidayYears(),
  ]);
  return { ...result, stats, years: years.map((row) => ({ year: Number(row.year), total: Number(row.total) })) };
}

export async function getHoliday(holidayId: number) {
  const row = await repo.findHolidayById(holidayId);
  if (!row) throw notFound('Holiday');
  return row;
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export async function createHoliday(payload: unknown, actor: ActorContext) {
  const input = holidaySchema.parse(payload);
  const employerId = input.employer_id ?? null;

  const existing = await repo.holidayAt(input.holiday_date, input.holiday_name, employerId);
  if (existing) {
    throw conflict('DUPLICATE', `“${input.holiday_name}” is already declared on ${input.holiday_date}`);
  }

  const holidayId = await repo.insertHoliday({
    employerId,
    name: input.holiday_name,
    date: input.holiday_date,
    year: yearOf(input.holiday_date),
    type: input.holiday_type,
    isPaid: Boolean(input.is_paid),
    description: input.description ?? null,
    createdBy: actor.user.id,
  });

  await writeActivityLog({
    ...actorFields(actor),
    action: 'created',
    module: 'holiday',
    entityType: 'holiday',
    entityId: holidayId,
    entityLabel: input.holiday_name,
    description: `Holiday “${input.holiday_name}” declared on ${input.holiday_date} (${input.holiday_type}, ${input.is_paid ? 'paid' : 'unpaid'})${employerId ? ` for employer #${employerId}` : ' for every employer'}`,
    newValues: {
      holiday_name: input.holiday_name,
      holiday_date: input.holiday_date,
      holiday_type: input.holiday_type,
      is_paid: Boolean(input.is_paid),
    },
  });

  return { id: holidayId, holiday_date: input.holiday_date, year: yearOf(input.holiday_date) };
}

export async function updateHoliday(holidayId: number, payload: unknown, actor: ActorContext) {
  const current = await repo.findHolidayById(holidayId);
  if (!current) throw notFound('Holiday');

  const input = holidaySchema.parse(payload);
  const employerId = input.employer_id ?? null;
  if (input.holiday_date !== String(current.holiday_date).slice(0, 10) || input.holiday_name !== current.holiday_name) {
    const clash = await repo.holidayAt(input.holiday_date, input.holiday_name, employerId, holidayId);
    if (clash) throw conflict('DUPLICATE', `“${input.holiday_name}” is already declared on ${input.holiday_date}`);
  }

  const mapped: Record<string, string | number | null> = {
    employer_id: employerId,
    holiday_name: input.holiday_name,
    holiday_date: input.holiday_date,
    year: yearOf(input.holiday_date),
    holiday_type: input.holiday_type,
    is_paid: input.is_paid ? 1 : 0,
    description: input.description ?? null,
  };

  const fields: Record<string, string | number | null> = {};
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(mapped)) {
    const previous = current[key as keyof RowDataPacket] ?? null;
    const before = previous === null ? null : String(previous);
    const after = value === null ? null : String(value);
    if (before === after) continue;
    fields[key] = value;
    changed[key] = { from: previous, to: value };
  }
  if (!Object.keys(fields).length) throw conflict('NO_CHANGE', 'Nothing about this holiday has changed');

  await repo.updateHoliday(holidayId, fields);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'updated',
    module: 'holiday',
    entityType: 'holiday',
    entityId: holidayId,
    entityLabel: input.holiday_name,
    description: `Holiday “${input.holiday_name}” updated (${Object.keys(changed).join(', ')})`,
    oldValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value.to])),
  });

  return { id: holidayId, changed: Object.keys(changed) };
}

export async function deleteHoliday(holidayId: number, actor: ActorContext) {
  const holiday = await repo.findHolidayById(holidayId);
  if (!holiday) throw notFound('Holiday');
  await repo.softDeleteHoliday(holidayId);
  await writeActivityLog({
    ...actorFields(actor),
    action: 'deleted',
    module: 'holiday',
    entityType: 'holiday',
    entityId: holidayId,
    entityLabel: String(holiday.holiday_name),
    description: `Holiday “${holiday.holiday_name}” (${String(holiday.holiday_date).slice(0, 10)}) removed from the master`,
    oldValues: { holiday_name: holiday.holiday_name, holiday_date: holiday.holiday_date },
  });
  return { id: holidayId };
}

/**
 * Completes a year with the three national holidays.
 *
 * These three fall on the same date every year, so they are facts rather than
 * defaults — the moving festivals are declared by the state government each year
 * and stay a human decision. Already-declared rows are counted, not duplicated.
 */
export async function addNationalHolidays(payload: unknown, actor: ActorContext) {
  const input = nationalHolidaySchema.parse(payload);
  const employerId = input.employer_id ?? null;

  const added: string[] = [];
  const skipped: string[] = [];
  for (const holiday of NATIONAL_HOLIDAYS) {
    const date = `${input.year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`;
    const existing = await repo.holidayAt(date, holiday.name, employerId);
    if (existing) {
      // A platform-wide declaration skips if *either* the platform row or this
      // employer's own row already holds that name and date.
      if (employerId && !existing.employer_id) skipped.push(holiday.name);
      else if (!employerId && !existing.employer_id) skipped.push(holiday.name);
      else if (employerId && existing.employer_id) skipped.push(holiday.name);
      else {
        await repo.insertHoliday({
          employerId,
          name: holiday.name,
          date,
          year: input.year,
          type: 'National',
          isPaid: Boolean(input.is_paid),
          description: `National holiday declared for ${input.year}`,
          createdBy: actor.user.id,
        });
        added.push(holiday.name);
      }
      continue;
    }
    await repo.insertHoliday({
      employerId,
      name: holiday.name,
      date,
      year: input.year,
      type: 'National',
      isPaid: Boolean(input.is_paid),
      description: `National holiday declared for ${input.year}`,
      createdBy: actor.user.id,
    });
    added.push(holiday.name);
  }

  if (added.length) {
    await writeActivityLog({
      ...actorFields(actor),
      action: 'created',
      module: 'holiday',
      entityType: 'holiday',
      entityId: null,
      entityLabel: `National holidays ${input.year}`,
      description: `${added.length} national holiday(s) added for ${input.year}${employerId ? ` for employer #${employerId}` : ''}${skipped.length ? ` (${skipped.length} already declared)` : ''}`,
      newValues: { year: input.year, added, skipped },
    });
  }

  return { year: input.year, added, skipped, total: added.length + skipped.length };
}

/** The establishment's legal calendar for a year, used by payroll and leave. */
export async function holidayCalendar(year: number, employerId?: number | null) {
  const result = await repo.findHolidays({ page: 1, limit: 100, year, employerId: employerId ?? null, sortBy: 'holiday_date', sortDir: 'asc' });
  return result.data.map((row) => ({
    id: Number(row.id),
    name: String(row.holiday_name),
    date: String(row.holiday_date).slice(0, 10),
    type: String(row.holiday_type),
    is_paid: Boolean(Number(row.is_paid)),
    employer_id: row.employer_id === null ? null : Number(row.employer_id),
  }));
}

/** Working days per month for a year — payroll and attendance both read this. */
export async function workingDaySummary(year: number, employerId?: number | null, weeklyOffDay = 0) {
  const months: { month: number; calendarDays: number; weeklyOffs: number; holidays: number; workingDays: number }[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const summary = await repo.workingDays(year, month, weeklyOffDay, employerId ?? null);
    months.push({
      month,
      calendarDays: summary.calendarDays,
      weeklyOffs: summary.weeklyOffs,
      holidays: summary.holidays,
      workingDays: summary.workingDays,
    });
  }
  return { year, weeklyOffDay, months };
}

/* ══════════════════════════════════ options ══════════════════════════════ */

/**
 * The pickers on the event form.
 *
 * An auditor only ever files events against its own audits, so the audit list is
 * narrowed to that auditor and the company/auditor pickers are left empty — the
 * scope on the write path pins both regardless.
 */
export async function calendarOptions(scope: { auditorId?: number | null } = {}) {
  const auditorId = scope.auditorId ?? null;
  const [employers, units, auditors, assignments] = await Promise.all([
    auditorId ? Promise.resolve([]) : repo.employerOptions(),
    auditorId ? Promise.resolve([]) : repo.unitOptions(),
    auditorId ? Promise.resolve([]) : repo.auditorOptions(),
    repo.assignmentOptions(null, auditorId),
  ]);
  return {
    employers: employers.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: String(row.employer_code ?? '') })),
    units: units.map((row) => ({ value: String(row.id), label: String(row.unit_name), employerId: Number(row.employer_id) })),
    auditors: auditors.map((row) => ({
      value: String(row.id),
      label: `${String(row.auditor_name).trim()} · ${String(row.auditor_code)}`,
    })),
    assignments: assignments.map((row) => ({
      value: String(row.id),
      label: String(row.assignment_number),
      employerId: Number(row.employer_id),
      auditorId: row.auditor_id === null ? null : Number(row.auditor_id),
    })),
  };
}
