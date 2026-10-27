'use client';

/**
 * The holiday master.
 *
 * One register for the whole establishment: the national days that fall on the
 * same date every year, the state and festival days, and the company days that
 * belong to one employer. Beside it, the working-day count for the year — the
 * number the attendance register and the payroll engine both count against — is
 * recomputed live from these rows, so what you declare here is what payroll pays.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate, DAY_NAMES, MONTH_NAMES } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { HOLIDAY_TYPES, NATIONAL_HOLIDAYS } from '@/lib/validations/calendar.validation';
import { HolidayFormModal, type HolidayFormValue } from '@/components/calendar/holiday-form-modal';

interface HolidayRow extends HolidayFormValue {
  id: number;
  year: number;
  is_paid: number;
  description: string | null;
  company_name: string | null;
  created_by_first: string | null;
  created_by_last: string | null;
  created_at: string;
}

interface HolidayStats {
  total: number;
  paid: number;
  national: number;
  state: number;
  festival: number;
  company: number;
  optional: number;
  upcoming: number;
  next?: { holiday_name: string; holiday_date: string } | null;
  byMonth: { month: number; total: number }[];
}

const TYPE_TONE: Record<string, 'danger' | 'info' | 'violet' | 'brand' | 'slate'> = {
  National: 'danger',
  State: 'info',
  Festival: 'violet',
  Company: 'brand',
  Optional: 'slate',
};

export function HolidaysRegister({
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
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [weeklyOff, setWeeklyOff] = useState('0');
  const [workingDays, setWorkingDays] = useState<{ year: number; weeklyOffDay: number; months: { month: number; calendarDays: number; weeklyOffs: number; holidays: number; workingDays: number }[] } | null>(null);
  const [employerOptions, setEmployerOptions] = useState<{ value: string; label: string }[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<HolidayFormValue | null>(null);
  const [pending, setPending] = useState<HolidayRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [nationalBusy, setNationalBusy] = useState(false);

  const list = useList<HolidayRow>({
    endpoint: '/api/admin/calendar/holidays',
    initialFilters: { search: '', year, holiday_type: 'all', employer_id: 'all', paid: 'all', from_date: '', to_date: '' },
    initialSortBy: 'holiday_date',
    initialSortDir: 'asc',
  });

  const stats = (list.extra.stats as HolidayStats | undefined) ?? null;
  const years = (list.extra.years as { year: number; total: number }[] | undefined) ?? [];

  const loadWorkingDays = useCallback(async () => {
    const result = await api.get(`/api/admin/calendar/working-days?year=${year}&weekly_off=${weeklyOff}`);
    if (result.ok && result.data) setWorkingDays(result.data as unknown as typeof workingDays);
  }, [year, weeklyOff]);

  useEffect(() => {
    void loadWorkingDays();
  }, [loadWorkingDays]);

  useEffect(() => {
    void (async () => {
      const result = await api.get<{ employers: { value: string; label: string; hint?: string }[] }>('/api/admin/calendar/options');
      if (result.ok && result.data) setEmployerOptions(result.data.employers ?? []);
    })();
  }, []);

  // The year filter is a real filter, so the register and the counters move together.
  useEffect(() => {
    list.setFilter('year', year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  function openCreate() {
    setEditing(null);
    setFormMode('create');
    setFormOpen(true);
  }

  function refreshEverything() {
    list.refresh();
    void loadWorkingDays();
  }

  async function remove() {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await api.delete(`/api/admin/calendar/holidays/${pending.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPending(null);
      refreshEverything();
    } finally {
      setBusy(false);
    }
  }

  async function addNational() {
    setNationalBusy(true);
    try {
      const result = await api.post('/api/admin/calendar/holidays/national', { year: Number(year) });
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      refreshEverything();
    } finally {
      setNationalBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(
      `complianceos-holidays-${year}.csv`,
      ['Holiday', 'Date', 'Day', 'Type', 'Paid', 'Applies to', 'Note'],
      list.data.map((row) => [
        row.holiday_name,
        String(row.holiday_date).slice(0, 10),
        DAY_NAMES[new Date(`${String(row.holiday_date).slice(0, 10)}T00:00:00`).getDay()],
        row.holiday_type,
        Number(row.is_paid) ? 'Paid' : 'Unpaid',
        row.company_name ?? 'Every company',
        row.description ?? '',
      ])
    );
  }

  const yearOptions = [...new Set([
    new Date().getFullYear(),
    new Date().getFullYear() + 1,
    ...years.map((row) => row.year),
  ])].sort((a, b) => b - a);

  const yearTotals = workingDays?.months.reduce(
    (totals, month) => ({
      calendarDays: totals.calendarDays + month.calendarDays,
      weeklyOffs: totals.weeklyOffs + month.weeklyOffs,
      holidays: totals.holidays + month.holidays,
      workingDays: totals.workingDays + month.workingDays,
    }),
    { calendarDays: 0, weeklyOffs: 0, holidays: 0, workingDays: 0 }
  );

  const columns: Column<HolidayRow>[] = [
    {
      key: 'holiday_date',
      header: 'Date',
      render: (row) => {
        const date = String(row.holiday_date).slice(0, 10);
        return (
          <div>
            <p className="text-[13px] font-medium text-ink">{formatDate(date)}</p>
            <p className="text-[11px] text-ink-muted">{DAY_NAMES[new Date(`${date}T00:00:00`).getDay()]}</p>
          </div>
        );
      },
    },
    {
      key: 'holiday_name',
      header: 'Holiday',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{row.holiday_name}</p>
          {row.description && <p className="mt-0.5 text-[12px] text-ink-muted">{row.description}</p>}
        </div>
      ),
    },
    {
      key: 'holiday_type',
      header: 'Type',
      render: (row) => <Badge tone={TYPE_TONE[row.holiday_type] ?? 'slate'}>{row.holiday_type}</Badge>,
    },
    {
      key: 'is_paid',
      header: 'Paid',
      hideOnMobile: true,
      render: (row) => (
        <Badge tone={Number(row.is_paid) ? 'success' : 'slate'}>{Number(row.is_paid) ? 'Paid' : 'Unpaid'}</Badge>
      ),
    },
    {
      key: 'employer_id',
      header: 'Applies to',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-[13px] text-ink-soft">{row.company_name ?? 'Every company'}</span>
      ),
    },
    {
      key: 'created_by',
      header: 'Declared by',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">
            {row.created_by_first ? `${row.created_by_first} ${row.created_by_last ?? ''}`.trim() : 'The system'}
          </p>
          <p className="text-[11px] text-ink-muted">{formatDate(row.created_at)}</p>
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
          {canEdit && (
            <button type="button" className="btn-icon" title="Edit the holiday" onClick={() => { setEditing(row); setFormMode('edit'); setFormOpen(true); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove the holiday" onClick={() => setPending(row)}>
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
        <StatCard label={`Holidays in ${year}`} value={formatNumber(stats?.total ?? 0)} tone="brand" hint={`${formatNumber(stats?.upcoming ?? 0)} still to come`} />
        <StatCard label="Paid" value={formatNumber(stats?.paid ?? 0)} tone="emerald" />
        <StatCard label="National" value={formatNumber(stats?.national ?? 0)} tone="red" hint="Republic Day, Independence Day, Gandhi Jayanti" />
        <StatCard label="State & festival" value={formatNumber((stats?.state ?? 0) + (stats?.festival ?? 0))} tone="violet" />
        <StatCard label="Company days" value={formatNumber(stats?.company ?? 0)} tone="amber" hint="Declared for one employer" />
        <StatCard
          label="Working days"
          value={formatNumber(yearTotals?.workingDays ?? 0)}
          tone="slate"
          hint={`${formatNumber(yearTotals?.calendarDays ?? 0)} calendar days − ${formatNumber(yearTotals?.weeklyOffs ?? 0)} weekly offs − ${formatNumber(yearTotals?.holidays ?? 0)} holidays`}
        />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search holiday or note' },
            { key: 'year', type: 'select', label: 'Year', options: yearOptions.map((option) => ({ value: String(option), label: String(option) })) },
            { key: 'holiday_type', type: 'select', label: 'Type', options: [
              { value: 'all', label: 'Every type' },
              ...HOLIDAY_TYPES.map((type) => ({ value: type, label: type })),
            ] },
            { key: 'employer_id', type: 'select', label: 'Applies to', options: [
              { value: 'all', label: 'Every scope' },
              ...employerOptions,
            ] },
            { key: 'paid', type: 'select', label: 'Paid', options: [
              { value: 'all', label: 'Paid and unpaid' },
              { value: 'yes', label: 'Paid only' },
              { value: 'no', label: 'Unpaid only' },
            ] },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={() => { list.clearFilters(); setYear(String(new Date().getFullYear())); }}
          extra={
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/admin/calendar" variant="outline" size="sm">Back to the calendar</LinkButton>
              {canExport && (
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!list.data.length}>Export CSV</Button>
              )}
              {canCreate && (
                <Button variant="outline" size="sm" onClick={addNational} loading={nationalBusy}>
                  Add {year} national holidays
                </Button>
              )}
              {canCreate && <Button size="sm" onClick={openCreate}>Declare holiday</Button>}
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">
            {NATIONAL_HOLIDAYS.map((holiday) => `${holiday.name} ${String(holiday.day).padStart(2, '0')}/${String(holiday.month).padStart(2, '0')}`).join(' · ')} are declared in one click.
          </p>
          <p className="text-[13px] text-ink-muted">{formatNumber(list.pagination.total)} holiday(s) in {year}</p>
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle={`No holidays declared for ${year}`}
          emptySubtitle="Declare the year's holidays — the working-day count and the payroll period both read this register."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Working days in {year}</h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                Calendar days minus the weekly off, minus the holidays that fall on a working day. Attendance and payroll both count against these numbers.
              </p>
            </div>
            <div className="w-56">
              <Select
                label="Weekly off"
                size="sm"
                value={weeklyOff}
                onChange={setWeeklyOff}
                options={DAY_NAMES.map((name, index) => ({ value: String(index), label: name }))}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-[#f8fafc] text-left text-[13px] font-semibold text-ink-soft">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Calendar days</th>
                  <th className="px-3 py-2 text-right">Weekly offs</th>
                  <th className="px-3 py-2 text-right">Holidays</th>
                  <th className="px-3 py-2 text-right">Working days</th>
                </tr>
              </thead>
              <tbody>
                {(workingDays?.months ?? []).map((month) => (
                  <tr key={month.month} className="border-b border-line last:border-0 hover:bg-[#f8fafc]">
                    <td className="px-3 py-2 text-ink">{MONTH_NAMES[month.month - 1]}</td>
                    <td className="px-3 py-2 text-right text-ink-soft">{month.calendarDays}</td>
                    <td className="px-3 py-2 text-right text-ink-soft">{month.weeklyOffs}</td>
                    <td className="px-3 py-2 text-right text-ink-soft">{month.holidays}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ink">{month.workingDays}</td>
                  </tr>
                ))}
                {yearTotals && (
                  <tr className="bg-[#f8fafc] font-semibold">
                    <td className="px-3 py-2 text-ink">Year</td>
                    <td className="px-3 py-2 text-right text-ink">{yearTotals.calendarDays}</td>
                    <td className="px-3 py-2 text-right text-ink">{yearTotals.weeklyOffs}</td>
                    <td className="px-3 py-2 text-right text-ink">{yearTotals.holidays}</td>
                    <td className="px-3 py-2 text-right text-brand-600">{yearTotals.workingDays}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <HolidayFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refreshEverything}
        mode={formMode}
        holiday={editing}
        employerOptions={employerOptions}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={remove}
        loading={busy}
        variant="danger"
        title={`Remove “${pending?.holiday_name ?? ''}” from the master?`}
        message="The holiday stops counting for the working-day computation and disappears from every panel's calendar. It is removed softly, so the register history keeps the row."
        confirmLabel="Remove holiday"
      />
    </div>
  );
}
