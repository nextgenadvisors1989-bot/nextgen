'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { DAY_NAMES, MONTH_NAMES, calendarGrid, isoDate } from '@/lib/utils/dates';

export interface CalendarEvent {
  id: string | number;
  title: string;
  date: string; // YYYY-MM-DD
  color?: string;
  type?: string;
}

/** Month / week / day calendar used for the audit calendar in all panels. */
export function Calendar({ events, view = 'month', value, onDateChange, onEventClick, onMonthChange }: {
  events: CalendarEvent[];
  view?: 'month' | 'week' | 'day';
  value: string;
  onDateChange?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onMonthChange?: (year: number, month: number) => void;
}) {
  const selected = new Date(`${value}T00:00:00`);
  const [cursor, setCursor] = useState({ year: selected.getFullYear(), month: selected.getMonth() + 1 });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + delta, 1);
    const nextCursor = { year: next.getFullYear(), month: next.getMonth() + 1 };
    setCursor(nextCursor);
    onMonthChange?.(nextCursor.year, nextCursor.month);
  };

  const grid = calendarGrid(cursor.year, cursor.month);
  const todayIso = isoDate(new Date());

  if (view === 'week' || view === 'day') {
    const days =
      view === 'day'
        ? [selected]
        : Array.from({ length: 7 }, (_, index) => {
            const start = new Date(selected);
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + index);
            return start;
          });

    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const key = isoDate(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          return (
            <div key={key} className="min-h-[200px] rounded-lg border border-line bg-white">
              <div className={clsx('border-b border-line px-3 py-2', key === todayIso && 'bg-brand-50')}>
                <p className="text-xs font-medium text-ink-muted">{DAY_NAMES[day.getDay()]}</p>
                <p className="text-sm font-semibold text-ink">{day.getDate()} {MONTH_NAMES[day.getMonth()].slice(0, 3)}</p>
              </div>
              <div className="space-y-1.5 p-2">
                {dayEvents.length === 0 && <p className="px-1 py-2 text-xs text-ink-muted">No events</p>}
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick?.(event)}
                    style={{ borderLeftColor: event.color ?? '#3b82f6' }}
                    className="w-full rounded border-l-[3px] bg-surface-muted px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-slate-200"
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-surface-muted" aria-label="Previous month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <h3 className="min-w-[150px] text-center text-sm font-semibold text-ink">
            {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </h3>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded-md border border-line p-1.5 text-ink-soft hover:bg-surface-muted" aria-label="Next month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 });
            onDateChange?.(todayIso);
          }}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-muted"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-line bg-surface-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((cell) => {
          const key = isoDate(cell.date);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isToday = key === todayIso;
          const isSelected = key === value;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDateChange?.(key)}
              className={clsx(
                'min-h-[92px] border-b border-r border-line p-1.5 text-left transition-colors hover:bg-surface-muted',
                !cell.inMonth && 'bg-slate-50/60 text-slate-400',
                isSelected && 'ring-2 ring-inset ring-brand-500'
              )}
            >
              <span className={clsx('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium', isToday ? 'bg-brand-500 text-white' : 'text-ink-soft')}>
                {cell.date.getDate()}
              </span>
              <span className="mt-1 block space-y-0.5">
                {dayEvents.slice(0, 2).map((event) => (
                  <span
                    key={event.id}
                    style={{ backgroundColor: `${event.color ?? '#3b82f6'}1a`, color: event.color ?? '#1d4ed8' }}
                    className="block truncate rounded px-1 py-0.5 text-[10px] font-medium"
                  >
                    {event.title}
                  </span>
                ))}
                {dayEvents.length > 2 && <span className="block px-1 text-[10px] text-ink-muted">+{dayEvents.length - 2} more</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
