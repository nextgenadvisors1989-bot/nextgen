/**
 * Water meter arithmetic, kept free of the database so it can be tested on its own.
 *
 * A meter is read now and then (cumulative reading, in kilolitres or litres). The water drawn between two readings is
 * the difference, spread evenly over the days between them. Compared with a NOC's approved quantity (litres per day)
 * that gives the figure an auditor needs: how many kilolitres a day the company really draws, and whether that is inside
 * the permitted limit.
 */

export type UsageStatus = 'Within limit' | 'Near limit' | 'Over limit' | 'No data';

export interface MeterReading {
  date: string; // YYYY-MM-DD
  value: number;
  isReset?: boolean;
}

export interface Interval {
  from: string;
  to: string;
  days: number;
  litres: number;
  kld: number;
}

export interface UsageSummary {
  litres: number;
  days: number;
  avgKld: number;
  approvedKld: number;
  percent: number | null;
  status: UsageStatus;
}

export interface MonthUsage extends UsageSummary {
  month: string; // YYYY-MM
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function dateOf(dayNo: number): string {
  return new Date(dayNo * DAY_MS).toISOString().slice(0, 10);
}

export function usageStatus(percent: number | null): UsageStatus {
  if (percent === null || Number.isNaN(percent)) return 'No data';
  if (percent > 100) return 'Over limit';
  if (percent >= 90) return 'Near limit';
  return 'Within limit';
}

/**
 * The draw between each pair of consecutive readings. The first reading has nothing before it; a reading marked as a
 * meter reset (replacement, rollover) starts a new baseline instead of producing an interval.
 */
export function intervals(readings: MeterReading[], unit: 'KL' | 'L'): Interval[] {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const factor = unit === 'KL' ? 1000 : 1;
  const out: Interval[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (current.isReset) continue;
    const days = dayNumber(current.date) - dayNumber(previous.date);
    const difference = current.value - previous.value;
    if (days <= 0 || difference < 0) continue;
    const litres = difference * factor;
    out.push({ from: previous.date, to: current.date, days, litres, kld: litres / days / 1000 });
  }
  return out;
}

export function summarise(list: Interval[], approvedLpd: number): UsageSummary {
  const litres = list.reduce((sum, item) => sum + item.litres, 0);
  const days = list.reduce((sum, item) => sum + item.days, 0);
  const avgKld = days > 0 ? litres / days / 1000 : 0;
  const approvedKld = approvedLpd / 1000;
  const percent = days > 0 && approvedKld > 0 ? (avgKld / approvedKld) * 100 : null;
  return { litres, days, avgKld, approvedKld, percent, status: usageStatus(percent) };
}

/** Month-by-month usage: each interval's water is spread evenly over its days, and every day goes to its own month. */
export function monthly(list: Interval[], approvedLpd: number): MonthUsage[] {
  const perMonth = new Map<string, { litres: number; days: number }>();
  for (const item of list) {
    const perDay = item.litres / item.days;
    for (let d = dayNumber(item.from) + 1; d <= dayNumber(item.to); d += 1) {
      const month = dateOf(d).slice(0, 7);
      const bucket = perMonth.get(month) ?? { litres: 0, days: 0 };
      bucket.litres += perDay;
      bucket.days += 1;
      perMonth.set(month, bucket);
    }
  }
  return [...perMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) => {
      const avgKld = bucket.litres / bucket.days / 1000;
      const approvedKld = approvedLpd / 1000;
      const percent = approvedKld > 0 ? (avgKld / approvedKld) * 100 : null;
      return { month, litres: bucket.litres, days: bucket.days, avgKld, approvedKld, percent, status: usageStatus(percent) };
    });
}

/** The part of the readings that falls in the last `windowDays` days up to `today`, for the "recent usage" figure. */
export function recentIntervals(list: Interval[], today: string, windowDays: number): Interval[] {
  const end = dayNumber(today);
  const start = end - windowDays;
  const out: Interval[] = [];
  for (const item of list) {
    const a = Math.max(dayNumber(item.from), start);
    const b = Math.min(dayNumber(item.to), end);
    if (b <= a) continue;
    const days = b - a;
    const litres = (item.litres / item.days) * days;
    out.push({ from: dateOf(a), to: dateOf(b), days, litres, kld: litres / days / 1000 });
  }
  return out;
}

/** What a NOC's status should read on a given day, from its expiry; an explicit Applied / Cancelled status wins. */
export function nocStatusFor(expiry: string | null, explicit: string | null | undefined, today: string): 'Applied' | 'Valid' | 'Expiring Soon' | 'Expired' | 'Cancelled' {
  if (explicit === 'Applied' || explicit === 'Cancelled') return explicit;
  if (!expiry) return 'Valid';
  const left = dayNumber(expiry) - dayNumber(today);
  if (left < 0) return 'Expired';
  if (left <= 90) return 'Expiring Soon';
  return 'Valid';
}

/**
 * Several meters can feed one NOC (two bore wells). Their draws are added day by day, so the combined series counts every
 * calendar day once however many meters were read.
 */
export function combineSources(lists: Interval[][]): Interval[] {
  const perDay = new Map<number, number>();
  for (const list of lists) {
    for (const item of list) {
      const rate = item.litres / item.days;
      for (let d = dayNumber(item.from) + 1; d <= dayNumber(item.to); d += 1) perDay.set(d, (perDay.get(d) ?? 0) + rate);
    }
  }
  return [...perDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([d, litres]) => ({ from: dateOf(d - 1), to: dateOf(d), days: 1, litres, kld: litres / 1000 }));
}
