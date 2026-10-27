'use client';

/**
 * The agenda.
 *
 * The calendar is a view over five registers — hand-made events, compliance
 * expiries, payroll periods, the holiday master and approved leave — and this
 * list is where they meet: one row per thing, in date order, each carrying the
 * colour of its source and a link to the screen that owns it.
 */
import Link from 'next/link';
import clsx from 'clsx';
import { EVENT_TYPE_COLORS } from '@/lib/validations/calendar.validation';
import { formatDate, DAY_NAMES, MONTH_NAMES } from '@/lib/utils/dates';

export interface AgendaEntryRow {
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

const SOURCE_LABEL: Record<string, string> = {
  event: 'Event',
  expiry: 'Compliance',
  payroll: 'Payroll',
  holiday: 'Holiday',
  leave: 'Leave',
};

export function AgendaList({
  entries,
  emptyTitle = 'Nothing on the agenda',
  emptySubtitle = 'Nothing falls in this window. Move to another month, or add an event.',
  compact = false,
}: {
  entries: AgendaEntryRow[];
  emptyTitle?: string;
  emptySubtitle?: string;
  compact?: boolean;
}) {
  if (!entries.length) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-medium text-ink">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">{emptySubtitle}</p>
      </div>
    );
  }

  // Group by day: an agenda is read a day at a time, not a row at a time.
  const grouped = new Map<string, AgendaEntryRow[]>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <ul className="divide-y divide-line">
      {[...grouped.entries()].map(([day, rows]) => {
        const parsed = new Date(`${day}T00:00:00`);
        return (
          <li key={day} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={clsx('text-[13px] font-semibold', day === todayIso ? 'text-brand-600' : 'text-ink')}>
                {DAY_NAMES[parsed.getDay()]}, {parsed.getDate()} {MONTH_NAMES[parsed.getMonth()]}
              </span>
              {day === todayIso && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600">Today</span>}
              <span className="text-[11px] text-ink-muted">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="space-y-1.5">
              {rows.map((entry) => {
                const colour = EVENT_TYPE_COLORS[entry.kind] ?? '#64748b';
                const body = (
                  <>
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-medium text-ink">{entry.title}</span>
                        <span className="text-[11px] text-ink-muted">{SOURCE_LABEL[entry.source] ?? entry.type_label}</span>
                        {entry.time && <span className="font-mono text-[11px] text-ink-muted">{entry.time}</span>}
                        {entry.priority && (entry.priority === 'High' || entry.priority === 'Urgent') && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{entry.priority}</span>
                        )}
                      </span>
                      {!compact && (entry.detail || entry.reference || entry.employer) && (
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
                          {entry.employer && <span>{entry.employer}</span>}
                          {entry.detail && <span>{entry.detail}</span>}
                          {entry.reference && <span className="font-mono">{entry.reference}</span>}
                          {entry.status && <span className="capitalize">{entry.status.replace(/_/g, ' ')}</span>}
                        </span>
                      )}
                    </span>
                  </>
                );

                return entry.href ? (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-surface-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={entry.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                    {body}
                  </div>
                );
              })}
            </div>
          </li>
        );
      })}
      <li className="px-4 py-2 text-[11px] text-ink-muted">
        Window {formatDate(entries[0]?.date ?? null)} — {formatDate(entries[entries.length - 1]?.date ?? null)}
      </li>
    </ul>
  );
}
