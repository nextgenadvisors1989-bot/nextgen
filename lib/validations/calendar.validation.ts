/**
 * Calendar & holiday master validation.
 *
 * The calendar is a single register seen through five panels, so the catalogue
 * defined here — event types, priorities, statuses, visibilities, holiday types —
 * is the only place those vocabularies live. The API validates against it, the
 * screens render from it, and the agenda reads its labels from it, which is what
 * keeps an audit date created by the assignment module and a meeting created by
 * hand visibly the same kind of thing.
 */
import { z } from 'zod';

const asTuple = <T extends readonly [string, ...string[]]>(values: T) => values as unknown as [string, ...string[]];

/* ────────────────────────────── catalogues ────────────────────────────── */

export const EVENT_TYPES = [
  'AUDIT', 'AUDIT_END_MEETING', 'REPORT_DUE', 'COMPLIANCE_EXPIRY', 'PAYROLL_RUN',
  'LEAVE', 'HOLIDAY', 'TRAINING', 'MEETING', 'INSPECTION', 'PERMIT_VALIDITY',
  'REMINDER', 'OTHER',
] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  AUDIT: 'Audit',
  AUDIT_END_MEETING: 'Audit closing meeting',
  REPORT_DUE: 'Report due',
  COMPLIANCE_EXPIRY: 'Compliance expiry',
  PAYROLL_RUN: 'Payroll run',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
  TRAINING: 'Training',
  MEETING: 'Meeting',
  INSPECTION: 'Inspection',
  PERMIT_VALIDITY: 'Permit validity',
  REMINDER: 'Reminder',
  OTHER: 'Other',
};

/** Event types a person creates by hand; the rest are written by other modules. */
export const MANUAL_EVENT_TYPES = [
  'MEETING', 'TRAINING', 'INSPECTION', 'REMINDER', 'OTHER',
] as const;

/** The colours each type renders with, used by the calendar grid and the agenda. */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  AUDIT: '#3b82f6',
  AUDIT_END_MEETING: '#8b5cf6',
  REPORT_DUE: '#0ea5e9',
  COMPLIANCE_EXPIRY: '#f59e0b',
  PAYROLL_RUN: '#10b981',
  LEAVE: '#14b8a6',
  HOLIDAY: '#ef4444',
  TRAINING: '#6366f1',
  MEETING: '#64748b',
  INSPECTION: '#f97316',
  PERMIT_VALIDITY: '#d946ef',
  REMINDER: '#eab308',
  OTHER: '#94a3b8',
};

export const EVENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'] as const;
export const EVENT_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const EVENT_VISIBILITIES = ['private', 'participants', 'employer', 'all'] as const;

export const HOLIDAY_TYPES = ['National', 'State', 'Festival', 'Company', 'Optional'] as const;

/** Reminder lead times offered on the event form, in minutes. */
export const REMINDER_CHOICES = [
  { value: '0', label: 'No reminder' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '180', label: '3 hours before' },
  { value: '1440', label: '1 day before' },
  { value: '2880', label: '2 days before' },
  { value: '10080', label: '1 week before' },
];

/**
 * The three holidays that fall on the same date every year, for every
 * establishment in the country. Offered as a one-click action on the holiday
 * master so a new financial year starts complete — the moving festivals are
 * declared by the state government year by year and are entered by hand.
 */
export const NATIONAL_HOLIDAYS = [
  { name: 'Republic Day', month: 1, day: 26 },
  { name: 'Independence Day', month: 8, day: 15 },
  { name: 'Gandhi Jayanti', month: 10, day: 2 },
] as const;

/* ─────────────────────────────── schemas ─────────────────────────────── */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const optionalId = z.coerce.number().int().positive().optional().nullable();

const booleanish = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

/** `datetime-local`, a plain date or a full ISO timestamp — normalised to `YYYY-MM-DD HH:MM`. */
const dateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/, 'Use a valid date and time')
  .transform((value) => {
    const [date, time] = value.replace('T', ' ').split(' ');
    return `${date} ${(time ?? '00:00').slice(0, 5)}`;
  });

const optionalDateTime = z
  .union([dateTime, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === '' || value === null ? null : value));

const optionalDate = z
  .union([
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-04-14'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === '' || value === null ? null : value));

/**
 * Attendees arrive three ways: as a pasted list (a newline/comma separated
 * string), as addresses typed into the form (an array of strings) or as the
 * stored objects. All three are accepted and normalised into `{ name, email }`
 * records by the service, so the stored column has exactly one shape.
 */
const attendeeList = z
  .union([
    z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().optional().nullable() })).max(50),
    z.array(z.string().trim().min(1).max(200)).max(50),
    z.string().max(4000),
    z.null(),
  ])
  .optional();

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the event a title').max(255),
    description: optionalString(5000),
    event_type: z.enum(asTuple(EVENT_TYPES)).optional().default('MEETING'),
    employer_id: optionalId,
    unit_id: optionalId,
    auditor_id: optionalId,
    assignment_id: optionalId,
    start_datetime: dateTime,
    end_datetime: optionalDateTime,
    all_day: booleanish.optional().default(false),
    location: optionalString(500),
    meeting_url: optionalString(500),
    attendees: attendeeList,
    reminder_minutes: z.coerce.number().int().min(0).max(40320).optional().nullable(),
    color: z
      .union([z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #3b82f6'), z.literal(''), z.null()])
      .optional()
      .transform((value) => (value === '' || value === null ? null : value)),
    priority: z.enum(asTuple(EVENT_PRIORITIES)).optional().default('Medium'),
    status: z.enum(asTuple(EVENT_STATUSES)).optional().default('scheduled'),
    visibility: z.enum(asTuple(EVENT_VISIBILITIES)).optional().default('participants'),
    recurrence_rule: optionalString(500),
  })
  .refine(
    (value) => !value.end_datetime || value.end_datetime >= value.start_datetime,
    { message: 'The event cannot end before it starts', path: ['end_datetime'] }
  )
  .refine(
    (value) => !value.meeting_url || /^https?:\/\//i.test(value.meeting_url),
    { message: 'Enter a full address such as https://meet.example.com/room', path: ['meeting_url'] }
  );

export const calendarEventUpdateSchema = calendarEventSchema;

export const calendarEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  event_type: z.union([z.enum(asTuple(EVENT_TYPES)), z.literal('all'), z.literal('')]).optional().default('all'),
  status: z.union([z.enum(asTuple(EVENT_STATUSES)), z.literal('all'), z.literal('')]).optional().default('all'),
  priority: z.union([z.enum(asTuple(EVENT_PRIORITIES)), z.literal('all'), z.literal('')]).optional().default('all'),
  visibility: z.union([z.enum(asTuple(EVENT_VISIBILITIES)), z.literal('all'), z.literal('')]).optional().default('all'),
  employer_id: z.coerce.number().int().positive().optional(),
  unit_id: z.coerce.number().int().positive().optional(),
  auditor_id: z.coerce.number().int().positive().optional(),
  created_by: z.coerce.number().int().positive().optional(),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  window: z.enum(['all', 'upcoming', 'past', 'today', 'this_month']).optional().default('all'),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/** The month grid reads one month at a time; the agenda reads a window. */
export const calendarWindowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional().default(new Date().getMonth() + 1),
  year: z.coerce.number().int().min(2000).max(2100).optional().default(new Date().getFullYear()),
  employer_id: z.coerce.number().int().positive().optional(),
  unit_id: z.coerce.number().int().positive().optional(),
  auditor_id: z.coerce.number().int().positive().optional(),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
});

/* ─────────────────────────────── holidays ─────────────────────────────── */

export const holidaySchema = z.object({
  holiday_name: z.string().trim().min(3, 'Give the holiday a name').max(200),
  holiday_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-04-14'),
  holiday_type: z.enum(asTuple(HOLIDAY_TYPES)).optional().default('Company'),
  is_paid: booleanish.optional().default(true),
  description: optionalString(500),
  employer_id: optionalId,
});

export const holidayUpdateSchema = holidaySchema;

export const holidayListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional(),
  year: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(''), z.literal('all')]).optional(),
  holiday_type: z.union([z.enum(asTuple(HOLIDAY_TYPES)), z.literal('all'), z.literal('')]).optional().default('all'),
  employer_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.literal('all')]).optional(),
  paid: z.enum(['all', 'yes', 'no']).optional().default('all'),
  from_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  to_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional().default(''),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/** One-click completion of a year with the three national holidays. */
export const nationalHolidaySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  employer_id: optionalId,
  is_paid: booleanish.optional().default(true),
});

/* ────────────────────────────── date helpers ──────────────────────────── */

/** `2026-04-14` from a `Date` or a driver timestamp. */
export function toIsoDay(value: Date | string): string {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

/** The first and last day of a month, as `YYYY-MM-DD`. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}
