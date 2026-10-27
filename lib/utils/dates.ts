/** Date helpers. All external dates are ISO `YYYY-MM-DD`; all timestamps are ISO-8601. */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_NAMES_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateString(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return formatDate(date);
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_SHORT[date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}`;
}

/** `2026-10-06` — the shape MySQL DATE columns and <input type="date"> expect. */
export function isoDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = toDate(value);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;
}

export function timeAgo(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? '' : 's'} ago`;
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function daysRemaining(target: string | Date | null | undefined): number | null {
  const date = toDate(target);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

export function addDays(value: string | Date, days: number): Date {
  const date = toDate(value) ?? new Date();
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(value: string | Date, months: number): Date {
  const date = toDate(value) ?? new Date();
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

export function startOfDay(value: string | Date): Date {
  const date = toDate(value) ?? new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: string | Date): Date {
  const date = toDate(value) ?? new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Payroll period for a month/year, e.g. 2026-04 -> 01 Apr 2026 to 30 Apr 2026. */
export function payrollPeriod(month: number, year: number) {
  const from = startOfMonth(year, month);
  const to = endOfMonth(year, month);
  return { from: isoDate(from), to: isoDate(to), totalDays: to.getDate() };
}

export function holidayCountInPeriod(month: number, year: number, weeklyOffDay = 0): number {
  const total = endOfMonth(year, month).getDate();
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    if (new Date(year, month - 1, day).getDay() === weeklyOffDay) count += 1;
  }
  return count;
}

/** Indian financial year (Apr–Mar) for a date, e.g. "2026-27". */
export function financialYear(value: string | Date = new Date()): string {
  const date = toDate(value) ?? new Date();
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function ageFromDob(dob: string | Date | null | undefined): number | null {
  const date = toDate(dob);
  if (!date) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const beforeBirthday =
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Service period expressed as "3 years, 2 months" between two dates. */
export function serviceDuration(from: string | Date | null, to: string | Date = new Date()): string {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return '—';
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'Less than a month';
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(', ');
}

export function completedYearsOfService(from: string | Date | null, to: string | Date = new Date()): number {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return 0;
  let years = end.getFullYear() - start.getFullYear();
  const beforeAnniversary =
    end.getMonth() < start.getMonth() ||
    (end.getMonth() === start.getMonth() && end.getDate() < start.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(years, 0);
}

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? ''} ${year}`;
}

export function monthShortLabel(month: number): string {
  return MONTH_NAMES_SHORT[month - 1] ?? '';
}

/** Calendar grid (Mon–Sun weeks) for the month view of the audit calendar. */
export function calendarGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const start = addDays(first, -startOffset);
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    cells.push({ date, inMonth: date.getMonth() === month - 1 });
  }
  return cells;
}

/** Today as YYYY-MM-DD in the server's own calendar (toISOString is UTC, which is still yesterday until 05:30 IST). */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
