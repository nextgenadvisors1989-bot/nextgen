'use client';

/**
 * The calendar screen (admin).
 *
 * Three views over the same data, because a calendar is read three ways: the
 * month grid to see the shape of the month, the agenda to read a day, and the
 * register to find a specific event and act on it. All three are fed by one read
 * (`/api/admin/calendar/overview`) so the grid and the list can never disagree,
 * and the register below carries the filters, sorting, pagination and export.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Calendar, type CalendarEvent } from '@/components/ui/calendar';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime, isoDate, MONTH_NAMES } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import {
  EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_STATUSES, EVENT_PRIORITIES, MANUAL_EVENT_TYPES,
} from '@/lib/validations/calendar.validation';
import { AgendaList, type AgendaEntryRow } from '@/components/calendar/agenda-list';
import { EventFormModal, type CalendarOption, type EventFormValue } from '@/components/calendar/event-form-modal';
import { EventDetailModal } from '@/components/calendar/event-detail-modal';

interface EventRow extends EventFormValue {
  id: number;
  uuid: string;
  company_name: string | null;
  unit_name: string | null;
  assignment_number: string | null;
  auditor_name: string | null;
  created_by_first: string | null;
  created_by_last: string | null;
  created_at: string;
  updated_at: string;
  type_label: string;
  reminder_sent: boolean;
}

interface CalendarStats {
  total: number;
  today: number;
  upcoming: number;
  thisWeek: number;
  thisMonth: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  highPriority: number;
}

const STATUS_TONE: Record<string, 'success' | 'slate' | 'danger' | 'warning'> = {
  scheduled: 'success',
  completed: 'slate',
  cancelled: 'danger',
  rescheduled: 'warning',
};

const PRIORITY_TONE: Record<string, 'slate' | 'brand' | 'warning' | 'danger'> = {
  Low: 'slate',
  Medium: 'brand',
  High: 'warning',
  Urgent: 'danger',
};

function monthOf(iso: string): { year: number; month: number } {
  const date = new Date(`${iso}T00:00:00`);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function timeRange(row: EventRow): string {
  if (row.all_day) return 'All day';
  const start = String(row.start_datetime).slice(11, 16);
  if (!row.end_datetime) return start;
  const end = String(row.end_datetime).slice(11, 16);
  return `${start} – ${end}`;
}

export function CalendarScreen({
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const { success, error: errorToast } = useToast();
  const today = isoDate(new Date());
  const [anchor, setAnchor] = useState(today);
  const cursor = useMemo(() => monthOf(anchor), [anchor]);
  const [selectedDay, setSelectedDay] = useState(today);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');

  const [overview, setOverview] = useState<{
    entries: AgendaEntryRow[];
    counts: { day: string; events: number; holidays: number }[];
    stats: CalendarStats;
    days: { events: number; expiries: number; payroll: number; holidays: number; leave: number };
  } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [options, setOptions] = useState<{
    employers: CalendarOption[];
    units: CalendarOption[];
    auditors: CalendarOption[];
    assignments: CalendarOption[];
  }>({ employers: [], units: [], auditors: [], assignments: [] });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<EventFormValue | null>(null);
  const [detail, setDetail] = useState<EventRow | null>(null);
  const [pending, setPending] = useState<{ row: EventRow; action: 'complete' | 'cancel' | 'reschedule' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remindersRunning, setRemindersRunning] = useState(false);

  const list = useList<EventRow>({
    endpoint: '/api/admin/calendar',
    initialFilters: { search: '', event_type: 'all', status: 'all', priority: 'all', from_date: '', to_date: '' },
    initialSortBy: 'start_datetime',
    initialSortDir: 'asc',
  });

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const result = await api.get<{ entries?: AgendaEntryRow[]; data?: AgendaEntryRow[] }>(
        `/api/admin/calendar/overview?year=${cursor.year}&month=${cursor.month}`
      );
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      const payload = result.data as unknown as {
        entries: AgendaEntryRow[];
        counts: { day: string; events: number; holidays: number }[];
        stats: CalendarStats;
        days: { events: number; expiries: number; payroll: number; holidays: number; leave: number };
      };
      setOverview(payload);
    } finally {
      setOverviewLoading(false);
    }
  }, [cursor.year, cursor.month, errorToast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void (async () => {
      const result = await api.get<{
        employers: CalendarOption[];
        units: CalendarOption[];
        auditors: CalendarOption[];
        assignments: CalendarOption[];
      }>('/api/admin/calendar/options');
      if (result.ok) {
        const payload = result.data as unknown as typeof options;
        setOptions({
          employers: payload.employers ?? [],
          units: payload.units ?? [],
          auditors: payload.auditors ?? [],
          assignments: payload.assignments ?? [],
        });
      }
    })();
    // The pickers only change when the underlying registers do.
  }, []);

  const gridEvents = useMemo<CalendarEvent[]>(
    () =>
      (overview?.counts ?? []).map((count) => ({
        id: count.day,
        title: `${count.events} event(s)${count.holidays ? ` · ${count.holidays} holiday(s)` : ''}`,
        date: count.day,
        color: count.events ? EVENT_TYPE_COLORS.EVENT ?? '#3b82f6' : '#f59e0b',
        type: 'summary',
      })),
    [overview]
  );

  const dayEntries = useMemo(
    () => (overview?.entries ?? []).filter((entry) => entry.date.slice(0, 10) === selectedDay.slice(0, 10)),
    [overview, selectedDay]
  );

  const stats = overview?.stats;
  const monthLabel = `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}`;

  function openCreate() {
    setEditing(null);
    setFormMode('create');
    setFormOpen(true);
  }

  function openEdit(row: EventRow) {
    setEditing(row);
    setFormMode('edit');
    setFormOpen(true);
  }

  function refreshEverything() {
    list.refresh();
    void loadOverview();
  }

  async function applyStatus() {
    if (!pending) return;
    setBusy(true);
    try {
      const { row, action } = pending;
      const result = action === 'delete'
        ? await api.delete(`/api/admin/calendar/${row.id}`, { confirm: true })
        : await api.patch(`/api/admin/calendar/${row.id}`, {
            status: action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : 'rescheduled',
          });
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPending(null);
      setDetail(null);
      refreshEverything();
    } finally {
      setBusy(false);
    }
  }

  async function runReminders() {
    setRemindersRunning(true);
    try {
      const result = await api.post('/api/admin/calendar/jobs/run');
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      list.refresh();
    } finally {
      setRemindersRunning(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-calendar-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Reference', 'Title', 'Type', 'Starts', 'Ends', 'Status', 'Priority', 'Company', 'Unit', 'Audit', 'Location'],
      list.data.map((row) => [
        `EVT-${row.id}`,
        row.title,
        EVENT_TYPE_LABELS[row.event_type] ?? row.event_type,
        row.start_datetime,
        row.end_datetime ?? '',
        row.status ?? '',
        row.priority,
        row.company_name ?? '',
        row.unit_name ?? '',
        row.assignment_number ?? '',
        row.location ?? '',
      ])
    );
  }

  const columns: Column<EventRow>[] = [
    {
      key: 'start_datetime',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-ink">{formatDateTime(row.start_datetime)}</p>
          <p className="text-[11px] text-ink-muted">{timeRange(row)}</p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Event',
      render: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setDetail(row)}
            className="flex items-center gap-2 text-left text-sm font-medium text-ink hover:text-brand-600"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color ?? EVENT_TYPE_COLORS[row.event_type] ?? '#64748b' }} aria-hidden />
            {row.title}
          </button>
          {row.description && <p className="mt-0.5 text-[12px] text-ink-muted">{truncate(row.description, 90)}</p>}
          {row.location && <p className="text-[11px] text-ink-muted">{row.location}</p>}
        </div>
      ),
    },
    {
      key: 'event_type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{EVENT_TYPE_LABELS[row.event_type] ?? row.event_type}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[String(row.status)] ?? 'slate'} dot>{String(row.status ?? 'scheduled')}</Badge>
          {row.priority && (row.priority === 'High' || row.priority === 'Urgent') && (
            <Badge tone={PRIORITY_TONE[row.priority] ?? 'slate'}>{row.priority}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'company_name',
      header: 'Where',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] text-ink-soft">{row.company_name ?? 'Platform-wide'}</p>
          {row.unit_name && <p className="text-[11px] text-ink-muted">{row.unit_name}</p>}
          {row.assignment_number && <p className="font-mono text-[11px] text-ink-muted">{row.assignment_number}</p>}
        </div>
      ),
    },
    {
      key: 'reminder',
      header: 'Reminder',
      hideOnMobile: true,
      render: (row) =>
        row.reminder_minutes === null || row.reminder_minutes === undefined ? (
          <span className="text-[12px] text-ink-muted">None</span>
        ) : (
          <div className="text-[12px]">
            <p className="text-ink-soft">
              {row.reminder_minutes >= 1440
                ? `${Math.round(row.reminder_minutes / 1440)} day(s) before`
                : `${Math.round(row.reminder_minutes / 60)} hour(s) before`}
            </p>
            <p className={row.reminder_sent ? 'text-emerald-600' : 'text-ink-muted'}>{row.reminder_sent ? 'Sent' : 'Pending'}</p>
          </div>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <button type="button" className="btn-icon" title="View the event" onClick={() => setDetail(row)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {canEdit && String(row.status) !== 'completed' && (
            <button type="button" className="btn-icon" title="Mark complete" onClick={() => setPending({ row, action: 'complete' })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="m5 12 5 5L20 7" />
              </svg>
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn-icon" title="Edit the event" onClick={() => openEdit(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove from the calendar" onClick={() => setPending({ row, action: 'delete' })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="This month" value={formatNumber(stats?.thisMonth ?? 0)} tone="brand" hint={`${formatNumber(stats?.total ?? 0)} events in the register`} />
        <StatCard label="Today" value={formatNumber(stats?.today ?? 0)} tone="violet" />
        <StatCard label="Upcoming" value={formatNumber(stats?.upcoming ?? 0)} tone="emerald" hint="Still scheduled, from now on" />
        <StatCard label="This week" value={formatNumber(stats?.thisWeek ?? 0)} tone="brand" />
        <StatCard label="High priority" value={formatNumber(stats?.highPriority ?? 0)} tone="amber" hint="High and urgent, still ahead" />
        <StatCard label="Holidays" value={formatNumber(overview?.days.holidays ?? 0)} tone="red" hint={`${monthLabel} working days are computed from these`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-icon"
                title="Previous month"
                onClick={() => {
                  const next = new Date(cursor.year, cursor.month - 2, 1);
                  setAnchor(isoDate(next));
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <p className="min-w-[150px] text-center text-sm font-semibold text-ink">{monthLabel}</p>
              <button
                type="button"
                className="btn-icon"
                title="Next month"
                onClick={() => {
                  const next = new Date(cursor.year, cursor.month, 1);
                  setAnchor(isoDate(next));
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { setAnchor(today); setSelectedDay(today); }}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-surface-muted"
              >
                Today
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-line p-0.5">
                {(['month', 'week', 'day'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={
                      view === option
                        ? 'rounded-md bg-brand-500 px-3 py-1.5 text-[13px] font-medium text-white'
                        : 'rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-surface-muted'
                    }
                  >
                    {option === 'month' ? 'Month' : option === 'week' ? 'Week' : 'Day'}
                  </button>
                ))}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={runReminders}
                  disabled={remindersRunning}
                  className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
                >
                  {remindersRunning ? 'Running…' : 'Run reminders'}
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!list.data.length}
                  className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
                >
                  Export CSV
                </button>
              )}
              {canCreate && <Button size="sm" onClick={openCreate}>New event</Button>}
            </div>
          </div>

          <div className="p-4">
            <Calendar
              events={gridEvents}
              view={view}
              value={selectedDay}
              onDateChange={setSelectedDay}
              onMonthChange={(year, month) => setAnchor(isoDate(new Date(year, month - 1, 1)))}
              onEventClick={(event) => setSelectedDay(String(event.date).slice(0, 10))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[11px] text-ink-muted">
            {Object.entries(EVENT_TYPE_COLORS).slice(0, 8).map(([type, colour]) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
                {EVENT_TYPE_LABELS[type] ?? type}
              </span>
            ))}
          </div>
        </Card>

        <Card padded={false} className="flex flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Agenda</p>
              <p className="text-[12px] text-ink-muted">{monthLabel} — everything merged, in date order</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {overview && (
                <>
                  <Badge tone="brand">{overview.days.events} events</Badge>
                  <Badge tone="warning">{overview.days.holidays} holidays</Badge>
                  {overview.days.expiries > 0 && <Badge tone="danger">{overview.days.expiries} expiries</Badge>}
                  {overview.days.payroll > 0 && <Badge tone="violet">{overview.days.payroll} payroll</Badge>}
                  {overview.days.leave > 0 && <Badge tone="info">{overview.days.leave} leave</Badge>}
                </>
              )}
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {overviewLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
                ))}
              </div>
            ) : (
              <AgendaList entries={overview?.entries ?? []} />
            )}
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-[12px] font-medium text-ink">
              {new Date(`${selectedDay}T00:00:00`).getDate()} {MONTH_NAMES[new Date(`${selectedDay}T00:00:00`).getMonth()]} — {dayEntries.length} item(s)
            </p>
            <div className="mt-1 max-h-52 overflow-y-auto">
              <AgendaList
                entries={dayEntries}
                compact
                emptyTitle="Nothing on this day"
                emptySubtitle="Pick another day, or add an event for this date."
              />
            </div>
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search title, description or location' },
            { key: 'event_type', type: 'select', label: 'Type', options: [
              { value: 'all', label: 'Every type' },
              ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
            ] },
            { key: 'status', type: 'select', label: 'Status', options: [
              { value: 'all', label: 'Every status' },
              ...EVENT_STATUSES.map((status) => ({ value: status, label: status })),
            ] },
            { key: 'priority', type: 'select', label: 'Priority', options: [
              { value: 'all', label: 'Every priority' },
              ...EVENT_PRIORITIES.map((priority) => ({ value: priority, label: priority })),
            ] },
            { key: 'from_date', type: 'date', label: 'From' },
            { key: 'to_date', type: 'date', label: 'To' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={<LinkButton href="/admin/calendar/holidays" variant="outline" size="sm">Holiday master</LinkButton>}
        />

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No events match those filters"
          emptySubtitle="Clear the filters, or add the first event to the calendar."
          onRowClick={(row) => setDetail(row)}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <EventFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refreshEverything}
        mode={formMode}
        event={editing}
        allowedTypes={MANUAL_EVENT_TYPES}
        options={options}
      />

      <EventDetailModal
        open={Boolean(detail)}
        event={detail}
        canEdit={canEdit}
        canDelete={canDelete}
        onClose={() => setDetail(null)}
        onEdit={() => { if (detail) { openEdit(detail); setDetail(null); } }}
        onAction={(action) => { if (detail) setPending({ row: detail, action }); }}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={applyStatus}
        loading={busy}
        variant={pending?.action === 'delete' ? 'danger' : 'primary'}
        title={
          pending?.action === 'delete' ? `Remove “${pending?.row.title}” from the calendar?`
            : pending?.action === 'complete' ? `Mark “${pending?.row.title}” complete?`
            : pending?.action === 'cancel' ? `Cancel “${pending?.row.title}”?`
            : `Reschedule “${pending?.row.title}”?`
        }
        message={
          pending?.action === 'delete'
            ? 'The event leaves every view of the calendar. Rows written by another module — an audit date, a payroll period — stay in that register and are only unlinked here.'
            : pending?.action === 'complete' ? 'The event is recorded as held. Its reminder will not be sent again.'
            : pending?.action === 'cancel' ? 'The event stays in the register as cancelled and disappears from the agenda. Everyone who was reminded is notified on their next visit that it will not take place.'
            : 'The event moves back to scheduled with its reminder re-armed, so the reminder fires again for the new time.'
        }
        confirmLabel={pending?.action === 'delete' ? 'Remove event' : 'Confirm'}
      />
    </div>
  );
}
