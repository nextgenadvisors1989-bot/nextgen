'use client';

/**
 * The monthly calendar as the smaller panels see it.
 *
 * One component, four panels, one scoped read: the auditor gets their diary,
 * the employer the company's dates, the employee the holidays and their own
 * leave. Nothing here widens a scope — the endpoint decides what comes back —
 * and no panel is offered a control its permissions do not allow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, type CalendarEvent } from '@/components/ui/calendar';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime, isoDate, MONTH_NAMES } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_STATUSES, MANUAL_EVENT_TYPES } from '@/lib/validations/calendar.validation';
import { AgendaList, type AgendaEntryRow } from '@/components/calendar/agenda-list';
import { EventFormModal, type CalendarOption, type EventFormValue } from '@/components/calendar/event-form-modal';
import { EventDetailModal, type EventDetail } from '@/components/calendar/event-detail-modal';

interface EventRow extends EventDetail {
  id: number;
  type_label?: string;
  company_name?: string | null;
}

interface Overview {
  entries: AgendaEntryRow[];
  counts: { day: string; events: number; holidays: number }[];
  days: { events: number; expiries: number; payroll: number; holidays: number; leave: number };
}

const STATUS_TONE: Record<string, 'success' | 'slate' | 'danger' | 'warning'> = {
  scheduled: 'success',
  completed: 'slate',
  cancelled: 'danger',
  rescheduled: 'warning',
};

export function PanelCalendar({
  variant,
  overviewEndpoint,
  listEndpoint,
  optionsEndpoint,
  allowedTypes,
  canCreate,
  canEdit,
  canDelete,
  withRegister,
}: {
  variant: 'auditor' | 'employer' | 'employee';
  overviewEndpoint: string;
  /** Only the auditor's diary is a register that can be edited; the rest are read-only views. */
  listEndpoint?: string;
  optionsEndpoint?: string;
  allowedTypes?: readonly string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Whether to render the register table below the month view. */
  withRegister: boolean;
}) {
  const { success, error: errorToast } = useToast();
  const today = isoDate(new Date());
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<EventFormValue | null>(null);
  const [detail, setDetail] = useState<EventRow | null>(null);
  const [pending, setPending] = useState<{ row: EventRow; action: 'complete' | 'cancel' | 'reschedule' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<{
    employers: CalendarOption[];
    units: CalendarOption[];
    auditors: CalendarOption[];
    assignments: CalendarOption[];
  }>({ employers: [], units: [], auditors: [], assignments: [] });

  const cursor = useMemo(() => {
    const date = new Date(`${anchor}T00:00:00`);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }, [anchor]);

  const list = useList<EventRow>({
    endpoint: listEndpoint ?? '',
    initialFilters: { search: '', event_type: 'all', status: 'all', from_date: '', to_date: '' },
    initialSortBy: 'start_datetime',
    initialSortDir: 'asc',
    enabled: Boolean(listEndpoint) && withRegister,
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get(`${overviewEndpoint}?year=${cursor.year}&month=${cursor.month}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      // The panel endpoints answer { data: entries[], counts, days } — entries live under `data`,
      // the month counters beside it — so the overview is assembled from the whole envelope.
      const envelope = result.raw as { data?: unknown; counts?: Overview['counts']; days?: Overview['days'] };
      setOverview({
        entries: Array.isArray(envelope.data) ? (envelope.data as AgendaEntryRow[]) : [],
        counts: Array.isArray(envelope.counts) ? envelope.counts : [],
        days: envelope.days ?? { events: 0, expiries: 0, payroll: 0, holidays: 0, leave: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, [overviewEndpoint, cursor.year, cursor.month, errorToast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!optionsEndpoint) return;
    void (async () => {
      const result = await api.get<typeof options>(optionsEndpoint);
      if (result.ok && result.data) {
        setOptions({
          employers: result.data.employers ?? [],
          units: result.data.units ?? [],
          auditors: result.data.auditors ?? [],
          assignments: result.data.assignments ?? [],
        });
      }
    })();
  }, [optionsEndpoint]);

  function refreshEverything() {
    list.refresh();
    void loadOverview();
  }

  async function applyStatus() {
    if (!pending || !listEndpoint) return;
    setBusy(true);
    try {
      const { row, action } = pending;
      const result = action === 'delete'
        ? await api.delete(`${listEndpoint}/${row.id}`, { confirm: true })
        : await api.patch(`${listEndpoint}/${row.id}`, {
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

  const gridEvents = useMemo<CalendarEvent[]>(
    () =>
      (overview?.counts ?? []).map((count) => ({
        id: count.day,
        title: `${count.events} event(s)${count.holidays ? ` · ${count.holidays} holiday(s)` : ''}`,
        date: count.day,
        color: count.events ? '#3b82f6' : '#f59e0b',
        type: 'summary',
      })),
    [overview]
  );

  const dayEntries = useMemo(
    () => (overview?.entries ?? []).filter((entry) => entry.date.slice(0, 10) === selectedDay.slice(0, 10)),
    [overview, selectedDay]
  );

  const monthLabel = `${MONTH_NAMES[cursor.month - 1]} ${cursor.year}`;
  const days = overview?.days;

  const columns: Column<EventRow>[] = [
    {
      key: 'start_datetime',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-[13px] font-medium text-ink">{formatDateTime(row.start_datetime)}</p>
          <p className="text-[11px] text-ink-muted">
            {Number(row.all_day) ? 'All day' : String(row.start_datetime).slice(11, 16)}
          </p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Event',
      render: (row) => (
        <div className="min-w-0">
          <button type="button" onClick={() => setDetail(row)} className="text-left text-sm font-medium text-ink hover:text-brand-600">
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
      render: (row) => <Badge tone={STATUS_TONE[String(row.status)] ?? 'slate'} dot>{String(row.status ?? 'scheduled')}</Badge>,
    },
    {
      key: 'assignment_number',
      header: 'Audit',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">{row.company_name ?? 'Platform-wide'}</p>
          {row.assignment_number && <p className="font-mono text-[11px] text-ink-muted">{row.assignment_number}</p>}
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
          <button type="button" className="btn-icon" title="View" onClick={() => setDetail(row)}>
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
            <button type="button" className="btn-icon" title="Edit" onClick={() => { setEditing(row); setFormMode('edit'); setFormOpen(true); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove" onClick={() => setPending({ row, action: 'delete' })}>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={monthLabel}
          value={formatNumber(days?.events ?? 0)}
          tone="brand"
          hint={variant === 'auditor' ? 'Your events and audit visits' : 'Events in this month'}
        />
        <StatCard label="Holidays" value={formatNumber(days?.holidays ?? 0)} tone="violet" hint="From the holiday master" />
        {variant === 'employer' && <StatCard label="Compliance expiries" value={formatNumber(days?.expiries ?? 0)} tone="amber" hint="Documents expiring this month" />}
        {variant === 'employer' && <StatCard label="Payroll periods" value={formatNumber(days?.payroll ?? 0)} tone="emerald" hint="Runs closing this month" />}
        {variant === 'auditor' && <StatCard label="Items on the agenda" value={formatNumber(overview?.entries.length ?? 0)} tone="emerald" hint="Everything in this month" />}
        {variant === 'employee' && <StatCard label="Your leave this month" value={formatNumber(days?.leave ?? 0)} tone="amber" hint="Approved leave only" />}
        {variant === 'employee' && <StatCard label="Days in this month" value={formatNumber(overview?.entries.length ?? 0)} tone="slate" hint="Holidays and your leave" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-icon"
                title="Previous month"
                onClick={() => setAnchor(isoDate(new Date(cursor.year, cursor.month - 2, 1)))}
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
                onClick={() => setAnchor(isoDate(new Date(cursor.year, cursor.month, 1)))}
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
              {canCreate && (
                <Button size="sm" onClick={() => { setEditing(null); setFormMode('create'); setFormOpen(true); }}>
                  New event
                </Button>
              )}
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

        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Agenda</p>
              <p className="text-[12px] text-ink-muted">{monthLabel}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {days && (
                <>
                  <Badge tone="brand">{days.events} events</Badge>
                  <Badge tone="warning">{days.holidays} holidays</Badge>
                  {days.leave > 0 && <Badge tone="info">{days.leave} leave</Badge>}
                </>
              )}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
                ))}
              </div>
            ) : (
              <AgendaList
                entries={overview?.entries ?? []}
                emptyTitle="Nothing in this month"
                emptySubtitle={variant === 'auditor' ? 'No audits or events fall in this month.' : 'No events, holidays or leave fall in this month.'}
              />
            )}
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="text-[12px] font-medium text-ink">
              {new Date(`${selectedDay}T00:00:00`).getDate()} {MONTH_NAMES[new Date(`${selectedDay}T00:00:00`).getMonth()]} — {dayEntries.length} item(s)
            </p>
            <div className="mt-1">
              <AgendaList entries={dayEntries} compact emptyTitle="Nothing on this day" emptySubtitle="Pick another day from the month grid." />
            </div>
          </div>
        </Card>
      </div>

      {withRegister && listEndpoint && (
        <Card padded={false}>
          <Filters
            definitions={[
              { key: 'search', type: 'search', placeholder: variant === 'auditor' ? 'Search your events' : 'Search events' },
              { key: 'event_type', type: 'select', label: 'Type', options: [
                { value: 'all', label: 'Every type' },
                ...Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
              ] },
              { key: 'status', type: 'select', label: 'Status', options: [
                { value: 'all', label: 'Every status' },
                ...EVENT_STATUSES.map((status) => ({ value: status, label: status })),
              ] },
              { key: 'from_date', type: 'date', label: 'From' },
              { key: 'to_date', type: 'date', label: 'To' },
            ]}
            values={list.filters}
            onChange={list.setFilter}
            onClear={list.clearFilters}
          />

          <DataTable
            columns={columns}
            data={list.data}
            loading={list.loading}
            rowKey={(row) => row.id}
            emptyTitle="Nothing in your diary matches those filters"
            emptySubtitle="Clear the filters, or add an event of your own."
            onRowClick={(row) => setDetail(row)}
          />

          <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
        </Card>
      )}

      {allowedTypes && listEndpoint && (
        <EventFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={refreshEverything}
          mode={formMode}
          event={editing}
          allowedTypes={allowedTypes}
          options={options}
          endpoint={listEndpoint}
          variant={variant === 'auditor' ? 'auditor' : 'admin'}
        />
      )}

      <EventDetailModal
        open={Boolean(detail)}
        event={detail}
        canEdit={canEdit}
        canDelete={canDelete}
        onClose={() => setDetail(null)}
        onEdit={() => { if (detail) { setEditing(detail); setFormMode('edit'); setFormOpen(true); setDetail(null); } }}
        onAction={(action) => { if (detail) setPending({ row: detail, action }); }}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={applyStatus}
        loading={busy}
        variant={pending?.action === 'delete' ? 'danger' : 'primary'}
        title={pending?.action === 'delete' ? `Remove “${pending?.row.title}”?` : `Mark “${pending?.row.title}” ${pending?.action === 'cancel' ? 'cancelled' : pending?.action === 'complete' ? 'complete' : 'rescheduled'}?`}
        message={
          pending?.action === 'delete'
            ? 'The event leaves your diary. An audit date stays on the audit itself — cancelling it is the assignment module’s job.'
            : pending?.action === 'complete'
              ? 'The event is recorded as held and its reminder stops.'
              : pending?.action === 'cancel'
                ? 'The event stays in the register as cancelled and drops out of the agenda.'
                : 'The event returns to scheduled with its reminder re-armed for the new time.'
        }
        confirmLabel={pending?.action === 'delete' ? 'Remove event' : 'Confirm'}
      />
    </div>
  );
}
