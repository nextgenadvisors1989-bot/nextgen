/**
 * Calendar & holiday master reads and writes.
 *
 * The calendar is a *view over other modules* as much as it is a register of its
 * own: audit dates and closing meetings are written here by the assignment
 * module, the compliance register contributes expiries and the payroll engine
 * contributes runs and periods. Those are surfaced by the agenda queries below —
 * read-only, derived from the owning tables, never duplicated — while hand-made
 * events (meetings, training, inspections) live in `calendar_events` proper.
 *
 * Every filter is bound as a parameter and every sort column is whitelisted.
 */
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import {
  buildSearch, dateRangeFilter, eqFilter, paginatedQuery, type ListQuery, type SqlValue,
} from '@/lib/db/query-helpers';

/* ══════════════════════════════════ events ═══════════════════════════════ */

export const EVENT_COLUMNS = `ce.id, ce.uuid, ce.title, ce.description, ce.event_type, ce.employer_id, ce.unit_id,
  ce.assignment_id, ce.auditor_id, ce.created_by, ce.start_datetime, ce.end_datetime, ce.all_day, ce.location,
  ce.meeting_url, ce.attendees_json, ce.reminder_minutes, ce.reminder_sent, ce.color, ce.priority, ce.status,
  ce.recurrence_rule, ce.parent_event_id, ce.visibility, ce.created_at, ce.updated_at,
  e.company_name, cu.unit_name, a.assignment_number,
  au.name AS auditor_name,
  cb.first_name AS created_by_first, cb.last_name AS created_by_last`;

export const EVENT_JOINS = `FROM calendar_events ce
  LEFT JOIN employers e ON e.id = ce.employer_id
  LEFT JOIN company_units cu ON cu.id = ce.unit_id
  LEFT JOIN audit_assignments a ON a.id = ce.assignment_id
  LEFT JOIN auditors au ON au.id = ce.auditor_id
  LEFT JOIN users cb ON cb.id = ce.created_by`;

const EVENT_SORT = ['start_datetime', 'title', 'event_type', 'status', 'priority', 'created_at', 'updated_at'];

export interface EventListFilters extends ListQuery {
  eventType?: string | null;
  status?: string | null;
  priority?: string | null;
  visibility?: string | null;
  employerId?: number | null;
  unitId?: number | null;
  auditorId?: number | null;
  createdBy?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  window?: string | null;
  /** Panel scoping: an auditor sees its own events, an employer its own company. */
  scope?: { auditorId?: number | null; employerId?: number | null };
}

function eventWhere(filters: EventListFilters, params: SqlValue[]): string {
  const where: string[] = ['ce.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['ce.title', 'ce.description', 'ce.location'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));

  for (const [column, value] of [
    ['ce.event_type', filters.eventType],
    ['ce.status', filters.status],
    ['ce.priority', filters.priority],
    ['ce.visibility', filters.visibility],
  ] as const) {
    if (value && value !== 'all') where.push(eqFilter(column, value, params).replace(/^\s*AND\s*/i, ''));
  }
  for (const [column, value] of [
    ['ce.employer_id', filters.employerId ?? filters.scope?.employerId],
    ['ce.unit_id', filters.unitId],
    ['ce.auditor_id', filters.auditorId ?? filters.scope?.auditorId],
    ['ce.created_by', filters.createdBy],
  ] as const) {
    if (value) where.push(eqFilter(column, value, params).replace(/^\s*AND\s*/i, ''));
  }

  const range = dateRangeFilter('ce.start_datetime', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));

  switch (filters.window) {
    case 'upcoming':
      where.push('ce.end_datetime IS NOT NULL AND ce.start_datetime >= NOW()');
      break;
    case 'past':
      where.push('ce.start_datetime < NOW()');
      break;
    case 'today':
      where.push('DATE(ce.start_datetime) = CURDATE()');
      break;
    case 'this_month':
      where.push('YEAR(ce.start_datetime) = YEAR(CURDATE()) AND MONTH(ce.start_datetime) = MONTH(CURDATE())');
      break;
    default:
      break;
  }

  return `WHERE ${where.join(' AND ')}`;
}

export function findEvents(filters: EventListFilters) {
  const params: SqlValue[] = [];
  const where = eventWhere(filters, params);
  return paginatedQuery<RowDataPacket>(
    `SELECT ${EVENT_COLUMNS} ${EVENT_JOINS} ${where}`,
    `SELECT COUNT(*) FROM calendar_events ce ${where}`,
    params,
    {
      ...filters,
      allowedSortColumns: EVENT_SORT,
      defaultSort: 'start_datetime',
    }
  );
}

export function findEventById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT ${EVENT_COLUMNS} ${EVENT_JOINS} WHERE ce.id = ? AND ce.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

/** Counters for the calendar header: what this month and this week hold. */
export async function eventStats(scope?: { auditorId?: number | null; employerId?: number | null }) {
  const params: SqlValue[] = [];
  const scopeSql: string[] = ['deleted_at IS NULL'];
  if (scope?.auditorId) scopeSql.push(eqFilter('auditor_id', scope.auditorId, params).replace(/^\s*AND\s*/i, ''));
  if (scope?.employerId) scopeSql.push(eqFilter('employer_id', scope.employerId, params).replace(/^\s*AND\s*/i, ''));
  const where = scopeSql.join(' AND ');

  const [counts] = await query<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(DATE(start_datetime) = CURDATE()) AS today,
       SUM(start_datetime >= NOW() AND status = 'scheduled') AS upcoming,
       SUM(YEARWEEK(start_datetime, 3) = YEARWEEK(CURDATE(), 3) AND status <> 'cancelled') AS this_week,
       SUM(YEAR(start_datetime) = YEAR(CURDATE()) AND MONTH(start_datetime) = MONTH(CURDATE())) AS this_month,
       SUM(status = 'completed') AS completed,
       SUM(status = 'cancelled') AS cancelled,
       SUM(status = 'rescheduled') AS rescheduled,
       SUM(priority IN ('High', 'Urgent') AND start_datetime >= NOW()) AS priority_high
     FROM calendar_events WHERE ${where}`,
    params
  );

  const byType = await query<RowDataPacket>(
    `SELECT event_type, COUNT(*) AS total FROM calendar_events WHERE ${where}
      GROUP BY event_type ORDER BY total DESC`,
    params
  );

  return {
    total: Number(counts?.total ?? 0),
    today: Number(counts?.today ?? 0),
    upcoming: Number(counts?.upcoming ?? 0),
    thisWeek: Number(counts?.this_week ?? 0),
    thisMonth: Number(counts?.this_month ?? 0),
    completed: Number(counts?.completed ?? 0),
    cancelled: Number(counts?.cancelled ?? 0),
    rescheduled: Number(counts?.rescheduled ?? 0),
    highPriority: Number(counts?.priority_high ?? 0),
    byType: byType.map((row) => ({ event_type: String(row.event_type), total: Number(row.total) })),
  };
}

export interface EventInput {
  title: string;
  description: string | null;
  eventType: string;
  employerId: number | null;
  unitId: number | null;
  assignmentId: number | null;
  auditorId: number | null;
  createdBy: number;
  startDatetime: string;
  endDatetime: string | null;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  attendeesJson: string | null;
  reminderMinutes: number | null;
  color: string | null;
  priority: string;
  status: string;
  visibility: string;
  recurrenceRule: string | null;
}

export function insertEvent(input: EventInput & { uuid: string }) {
  return insert(
    `INSERT INTO calendar_events (uuid, title, description, event_type, employer_id, unit_id, assignment_id,
                                  auditor_id, created_by, start_datetime, end_datetime, all_day, location,
                                  meeting_url, attendees_json, reminder_minutes, color, priority, status,
                                  visibility, recurrence_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.uuid, input.title, input.description, input.eventType, input.employerId, input.unitId,
      input.assignmentId, input.auditorId, input.createdBy, input.startDatetime, input.endDatetime,
      input.allDay ? 1 : 0, input.location, input.meetingUrl, input.attendeesJson, input.reminderMinutes,
      input.color, input.priority, input.status, input.visibility, input.recurrenceRule,
    ]
  );
}

export async function updateEvent(id: number, fields: Record<string, SqlValue>) {
  const columns = Object.keys(fields);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE calendar_events SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => fields[column]), id]
  );
  return Number(result.affectedRows ?? 0);
}

export function softDeleteEvent(id: number) {
  return execute('UPDATE calendar_events SET deleted_at = NOW(), status = ? WHERE id = ? AND deleted_at IS NULL', [
    'cancelled', id,
  ]);
}

/**
 * Reminder candidates: events whose reminder window has opened and whose owner
 * asked for a reminder. `reminder_sent` is stamped by the job, and the dispatch
 * ledger makes a repeated run idempotent even if it is not.
 */
export function dueEventReminders(limit = 50) {
  return query<RowDataPacket>(
    `SELECT ce.id, ce.title, ce.description, ce.event_type, ce.start_datetime, ce.end_datetime, ce.location,
            ce.meeting_url, ce.reminder_minutes, ce.auditor_id, ce.employer_id, ce.created_by, ce.priority,
            au.user_id AS auditor_user_id,
            e.company_name
       FROM calendar_events ce
       LEFT JOIN auditors au ON au.id = ce.auditor_id
       LEFT JOIN employers e ON e.id = ce.employer_id
      WHERE ce.deleted_at IS NULL
        AND ce.status = 'scheduled'
        AND ce.reminder_minutes IS NOT NULL
        AND ce.reminder_sent = 0
        AND ce.start_datetime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ce.reminder_minutes MINUTE)
      ORDER BY ce.start_datetime ASC
      LIMIT ${Math.min(limit, 200)}`
  );
}

export function markEventReminded(id: number) {
  return execute('UPDATE calendar_events SET reminder_sent = 1 WHERE id = ?', [id]);
}

/** Who should hear about an event: its auditor, its creator and the admins. */
export async function eventAudience(eventId: number) {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
       FROM calendar_events ce
       JOIN users u ON u.id IN (ce.created_by, (SELECT a.user_id FROM auditors a WHERE a.id = ce.auditor_id))
      WHERE ce.id = ? AND u.deleted_at IS NULL AND u.status = 'active'
      UNION
     SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.slug IN ('admin', 'super_admin') AND u.deleted_at IS NULL AND u.status = 'active'
      LIMIT 20`,
    [eventId]
  );
  return rows;
}

/* ═══════════════════════════════════ agenda ══════════════════════════════ */

/**
 * The unified agenda for a window.
 *
 * One row shape (`day, time, type, title, detail, reference, href, tone`) for
 * everything the calendar shows, produced by four reads that are appended:
 * events, compliance expiries, payroll runs and holidays. Nothing is written —
 * a compliance expiry appears on the agenda because the document says so.
 */
export interface AgendaScope {
  employerId?: number | null;
  auditorId?: number | null;
  /** Employees see the holidays and their own leave; nobody else's events. */
  employeeId?: number | null;
  includeExpiries?: boolean;
  includePayroll?: boolean;
  includeLeave?: boolean;
  includeHolidays?: boolean;
  /**
   * Which panel is asking. The agenda merges rows that live in five different
   * registers, and each of those registers has its own screen in each panel —
   * so the link a row carries must be built for the panel that will render it.
   */
  panel?: 'admin' | 'auditor' | 'employer' | 'employee';
}

/** Holidays that apply to an employer: its own rows plus the platform-wide ones. */
function holidayScope(params: SqlValue[], employerId: number | null | undefined): string {
  if (employerId) {
    params.push(employerId);
    return '(h.employer_id IS NULL OR h.employer_id = ?)';
  }
  return 'h.employer_id IS NULL';
}

export async function agendaEvents(
  from: string,
  to: string,
  scope: AgendaScope
): Promise<RowDataPacket[]> {
  const params: SqlValue[] = [from, to];
  const where = ['ce.deleted_at IS NULL', "ce.status <> 'cancelled'"];
  if (scope.auditorId) where.push(eqFilter('ce.auditor_id', scope.auditorId, params).replace(/^\s*AND\s*/i, ''));
  if (scope.employerId) where.push(eqFilter('ce.employer_id', scope.employerId, params).replace(/^\s*AND\s*/i, ''));
  if (scope.employeeId) return [];
  return query<RowDataPacket>(
    `SELECT ce.id, DATE(ce.start_datetime) AS day, TIME_FORMAT(ce.start_datetime, '%H:%i') AS time,
            ce.event_type AS kind, ce.title, ce.status, ce.priority, ce.all_day, ce.location,
            ce.employer_id, e.company_name, ce.assignment_id, a.assignment_number
       FROM calendar_events ce
       LEFT JOIN employers e ON e.id = ce.employer_id
       LEFT JOIN audit_assignments a ON a.id = ce.assignment_id
      WHERE ${where.join(' AND ')}
        AND DATE(ce.start_datetime) BETWEEN ? AND ?
      ORDER BY ce.start_datetime ASC
      LIMIT 500`,
    params
  );
}

/** Compliance documents whose expiry falls inside the window. */
export function agendaExpiries(from: string, to: string, employerId?: number | null) {
  const params: SqlValue[] = [from, to];
  const extra = employerId ? eqFilter('cd.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<RowDataPacket>(
    `SELECT cd.id, cd.expiry_date AS day, cd.document_name AS title, cd.compliance_status, cd.document_type,
            cd.employer_id, e.company_name
       FROM compliance_documents cd
       LEFT JOIN employers e ON e.id = cd.employer_id
      WHERE cd.deleted_at IS NULL AND cd.expiry_date IS NOT NULL
        AND cd.expiry_date BETWEEN ? AND ?
        AND ${extra}
      ORDER BY cd.expiry_date ASC
      LIMIT 300`,
    params
  );
}

/** Payroll runs whose period falls inside the window. */
export function agendaPayrollRuns(from: string, to: string, employerId?: number | null) {
  const params: SqlValue[] = [from, to];
  const extra = employerId ? eqFilter('pr.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<RowDataPacket>(
    `SELECT pr.id, pr.period_to AS day, pr.period_from, pr.period_to, pr.run_number, pr.status, pr.month, pr.year,
            pr.total_employees, pr.total_net, pr.employer_id, e.company_name
       FROM payroll_runs pr
       LEFT JOIN employers e ON e.id = pr.employer_id
      WHERE pr.deleted_at IS NULL
        AND pr.period_to BETWEEN ? AND ?
        AND ${extra}
      ORDER BY pr.period_to ASC
      LIMIT 200`,
    params
  );
}

/** Approved leave inside the window, for the panels that may see it. */
export function agendaLeave(from: string, to: string, employerId?: number | null, employeeId?: number | null) {
  const params: SqlValue[] = [from, to];
  const extra: string[] = [];
  if (employerId) extra.push(eqFilter('la.employer_id', employerId, params).replace(/^\s*AND\s*/i, ''));
  if (employeeId) extra.push(eqFilter('la.employee_id', employeeId, params).replace(/^\s*AND\s*/i, ''));
  return query<RowDataPacket>(
    `SELECT la.id, la.date_from, la.date_to, la.total_days, la.status, la.employee_id,
            lt.name AS leave_name, emp.name AS employee_name,
            la.employer_id
       FROM leave_applications la
       LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
       LEFT JOIN employees emp ON emp.id = la.employee_id
      WHERE la.deleted_at IS NULL AND la.status = 'Approved'
        AND la.date_from <= ? AND la.date_to >= ?
        ${extra.length ? `AND ${extra.join(' AND ')}` : ''}
      ORDER BY la.date_from ASC
      LIMIT 300`,
    params
  );
}

/** Holidays inside the window, platform-wide plus the employer's own. */
export function agendaHolidays(from: string, to: string, employerId?: number | null) {
  const params: SqlValue[] = [from, to];
  const scope = holidayScope(params, employerId);
  return query<RowDataPacket>(
    `SELECT h.id, h.holiday_date AS day, h.holiday_name AS title, h.holiday_type, h.is_paid, h.employer_id
       FROM holidays h
      WHERE h.deleted_at IS NULL AND h.holiday_date BETWEEN ? AND ? AND ${scope}
      ORDER BY h.holiday_date ASC
      LIMIT 200`,
    params
  );
}

/** Per-day counts for the month grid — one row per day that has anything on it. */
export async function agendaDayCounts(from: string, to: string, scope: AgendaScope) {
  const events = await query<RowDataPacket>(
    `SELECT DATE(ce.start_datetime) AS day, COUNT(*) AS total
       FROM calendar_events ce
      WHERE ce.deleted_at IS NULL AND ce.status <> 'cancelled'
        AND DATE(ce.start_datetime) BETWEEN ? AND ?
        ${scope.auditorId ? 'AND ce.auditor_id = ?' : ''}
        ${scope.employerId ? 'AND ce.employer_id = ?' : ''}
      GROUP BY DATE(ce.start_datetime)`,
    [from, to, ...(scope.auditorId ? [scope.auditorId] : []), ...(scope.employerId ? [scope.employerId] : [])]
  );

  const holidayParams: SqlValue[] = [from, to];
  const holidays = await query<RowDataPacket>(
    `SELECT h.holiday_date AS day, COUNT(*) AS total FROM holidays h
      WHERE h.deleted_at IS NULL AND h.holiday_date BETWEEN ? AND ? AND ${holidayScope(holidayParams, scope.employerId)}
      GROUP BY h.holiday_date`,
    holidayParams
  );

  const counts = new Map<string, { events: number; holidays: number }>();
  for (const row of events) {
    const key = String(row.day).slice(0, 10);
    counts.set(key, { events: Number(row.total), holidays: 0 });
  }
  for (const row of holidays) {
    const key = String(row.day).slice(0, 10);
    const entry = counts.get(key) ?? { events: 0, holidays: 0 };
    entry.holidays = Number(row.total);
    counts.set(key, entry);
  }

  return [...counts.entries()].map(([day, value]) => ({ day, ...value })).sort((a, b) => a.day.localeCompare(b.day));
}

/* ═══════════════════════════════════ holidays ════════════════════════════ */

export interface HolidayListFilters extends ListQuery {
  year?: number | null;
  holidayType?: string | null;
  employerId?: number | null;
  paid?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export function findHolidays(filters: HolidayListFilters) {
  const params: SqlValue[] = [];
  const where: string[] = ['h.deleted_at IS NULL'];
  const search = buildSearch(filters.search ?? null, ['h.holiday_name', 'h.description'], params);
  if (search) where.push(search.replace(/^\s*AND\s*/i, ''));
  if (filters.year) where.push(eqFilter('h.year', filters.year, params).replace(/^\s*AND\s*/i, ''));
  if (filters.holidayType && filters.holidayType !== 'all') {
    where.push(eqFilter('h.holiday_type', filters.holidayType, params).replace(/^\s*AND\s*/i, ''));
  }
  if (filters.employerId) where.push(eqFilter('h.employer_id', filters.employerId, params).replace(/^\s*AND\s*/i, ''));
  if (filters.paid === 'yes' || filters.paid === 'no') {
    where.push(eqFilter('h.is_paid', filters.paid === 'yes' ? 1 : 0, params).replace(/^\s*AND\s*/i, ''));
  }
  const range = dateRangeFilter('h.holiday_date', filters.fromDate ?? null, filters.toDate ?? null, params);
  if (range) where.push(range.replace(/^\s*AND\s*/i, ''));

  const whereSql = `WHERE ${where.join(' AND ')}`;
  return paginatedQuery<RowDataPacket>(
    `SELECT h.*, e.company_name, u.first_name AS created_by_first, u.last_name AS created_by_last
       FROM holidays h
       LEFT JOIN employers e ON e.id = h.employer_id
       LEFT JOIN users u ON u.id = h.created_by
       ${whereSql}`,
    `SELECT COUNT(*) FROM holidays h ${whereSql}`,
    params,
    {
      ...filters,
      allowedSortColumns: ['holiday_date', 'holiday_name', 'holiday_type', 'year', 'created_at'],
      defaultSort: 'holiday_date',
    }
  );
}

export function findHolidayById(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT h.*, e.company_name FROM holidays h
       LEFT JOIN employers e ON e.id = h.employer_id
      WHERE h.id = ? AND h.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

/** The same holiday declared twice (same date, same name, same scope) is a mistake. */
export function holidayAt(date: string, name: string, employerId: number | null, excludeId?: number | null) {
  const params: SqlValue[] = [date, name];
  const scope = employerId ? eqFilter('employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : 'employer_id IS NULL';
  return queryOne<RowDataPacket>(
    `SELECT id, holiday_name, holiday_date FROM holidays
      WHERE deleted_at IS NULL AND holiday_date = ? AND holiday_name = ? AND ${scope}
        ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
    excludeId ? [...params, excludeId] : params
  );
}

export async function holidayStats(year: number, employerId?: number | null) {
  const params: SqlValue[] = [year];
  const scope = employerId ? eqFilter('employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  const [counts] = await query<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(is_paid = 1) AS paid,
            SUM(holiday_type = 'National') AS national,
            SUM(holiday_type = 'State') AS state,
            SUM(holiday_type = 'Festival') AS festival,
            SUM(holiday_type = 'Company') AS company,
            SUM(holiday_type = 'Optional') AS optional,
            SUM(holiday_date >= CURDATE()) AS upcoming
       FROM holidays
      WHERE deleted_at IS NULL AND year = ? AND ${scope}`,
    params
  );
  const byMonth = await query<RowDataPacket>(
    `SELECT MONTH(holiday_date) AS month, COUNT(*) AS total FROM holidays
      WHERE deleted_at IS NULL AND year = ?
      GROUP BY MONTH(holiday_date) ORDER BY month ASC`,
    [year]
  );
  return {
    total: Number(counts?.total ?? 0),
    paid: Number(counts?.paid ?? 0),
    national: Number(counts?.national ?? 0),
    state: Number(counts?.state ?? 0),
    festival: Number(counts?.festival ?? 0),
    company: Number(counts?.company ?? 0),
    optional: Number(counts?.optional ?? 0),
    upcoming: Number(counts?.upcoming ?? 0),
    byMonth: byMonth.map((row) => ({ month: Number(row.month), total: Number(row.total) })),
  };
}

export function holidayYears() {
  return query<RowDataPacket>(
    `SELECT year, COUNT(*) AS total, SUM(employer_id IS NULL) AS platform_wide
       FROM holidays WHERE deleted_at IS NULL GROUP BY year ORDER BY year DESC`
  );
}

export function insertHoliday(input: {
  employerId: number | null;
  name: string;
  date: string;
  year: number;
  type: string;
  isPaid: boolean;
  description: string | null;
  createdBy: number;
}) {
  return insert(
    `INSERT INTO holidays (employer_id, holiday_name, holiday_date, year, holiday_type, is_paid, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.employerId, input.name, input.date, input.year, input.type, input.isPaid ? 1 : 0,
      input.description, input.createdBy,
    ]
  );
}

export async function updateHoliday(id: number, fields: Record<string, SqlValue>) {
  const columns = Object.keys(fields);
  if (!columns.length) return 0;
  const result = await execute(
    `UPDATE holidays SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => fields[column]), id]
  );
  return Number(result.affectedRows ?? 0);
}

export function softDeleteHoliday(id: number) {
  return execute('UPDATE holidays SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
}

/* ═══════════════════════════ counting working days ═══════════════════════ */

/**
 * Working days in a month: calendar days, minus the weekly off, minus holidays.
 *
 * `payroll_runs` and the attendance module both need this number, so it is
 * computed in one place from the same rows the calendar shows.
 */
export async function workingDays(
  year: number,
  month: number,
  weeklyOffDay = 0,
  employerId?: number | null
): Promise<{ calendarDays: number; weeklyOffs: number; holidays: number; workingDays: number; holidayDates: string[] }> {
  const calendarDays = new Date(year, month, 0).getDate();
  let weeklyOffs = 0;
  for (let day = 1; day <= calendarDays; day += 1) {
    if (new Date(year, month - 1, day).getDay() === weeklyOffDay) weeklyOffs += 1;
  }

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = `${year}-${String(month).padStart(2, '0')}-${String(calendarDays).padStart(2, '0')}`;
  const params: SqlValue[] = [from, to];
  const scope = holidayScope(params, employerId);
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT h.holiday_date FROM holidays h
      WHERE h.deleted_at IS NULL AND h.holiday_date BETWEEN ? AND ? AND ${scope}`,
    params
  );

  // A holiday that falls on the weekly off does not cost the establishment a
  // second day, so the two sets are merged rather than added.
  const offs = new Set<string>();
  for (let day = 1; day <= calendarDays; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === weeklyOffDay) offs.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  const holidayDates = rows.map((row) => String(row.holiday_date).slice(0, 10)).filter((date) => !offs.has(date));

  return {
    calendarDays,
    weeklyOffs,
    holidays: holidayDates.length,
    workingDays: calendarDays - weeklyOffs - holidayDates.length,
    holidayDates,
  };
}

/* ═══════════════════════════════ form options ════════════════════════════ */

export function employerOptions() {
  return query<RowDataPacket>(
    `SELECT id, company_name, employer_code FROM employers
      WHERE deleted_at IS NULL ORDER BY company_name ASC LIMIT 500`
  );
}

export function unitOptions(employerId?: number | null) {
  const params: SqlValue[] = [];
  const where = employerId ? eqFilter('u.employer_id', employerId, params).replace(/^\s*AND\s*/i, '') : '1 = 1';
  return query<RowDataPacket>(
    `SELECT u.id, u.unit_name, u.employer_id FROM company_units u
      WHERE u.deleted_at IS NULL AND ${where} ORDER BY u.unit_name ASC LIMIT 500`,
    params
  );
}

export function auditorOptions() {
  return query<RowDataPacket>(
    `SELECT a.id, a.auditor_code, a.name AS auditor_name
       FROM auditors a WHERE a.deleted_at IS NULL ORDER BY a.name ASC LIMIT 500`
  );
}

export function assignmentOptions(employerId?: number | null, auditorId?: number | null) {
  const params: SqlValue[] = [];
  const conditions: string[] = [];
  if (employerId) conditions.push(eqFilter('a.employer_id', employerId, params).replace(/^\s*AND\s*/i, ''));
  if (auditorId) conditions.push(eqFilter('a.auditor_id', auditorId, params).replace(/^\s*AND\s*/i, ''));
  const where = conditions.length ? conditions.join(' AND ') : '1 = 1';
  return query<RowDataPacket>(
    `SELECT a.id, a.assignment_number, a.employer_id, a.auditor_id, a.status
       FROM audit_assignments a
      WHERE a.deleted_at IS NULL AND a.status NOT IN ('cancelled', 'completed') AND ${where}
      ORDER BY a.created_at DESC LIMIT 300`,
    params
  );
}
