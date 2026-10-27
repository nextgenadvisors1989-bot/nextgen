'use client';

/**
 * The employee's own screens: payslips, attendance and leave.
 *
 * Everything here reads through the employee-scoped endpoints, so the panel can
 * only ever show the signed-in employee's own records — an unpublished payslip or
 * a colleague's application is a 404 at the API, not a hidden button. The payslip
 * list is the portal's copy of what was issued: the PDF button downloads the same
 * bilingual document the payroll office generated.
 */
import { useState } from 'react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate, MONTH_NAMES } from '@/lib/utils/dates';
import { PayslipDetail } from '@/components/payroll/payslip-detail';

interface MyPayslip {
  id: number; payslip_number: string; month_label: string; paid_days: number;
  gross_earnings: number; total_deductions: number; net_pay: number;
  payment_status: string; payment_mode: string | null; paid_at: string | null;
  is_published: boolean; net_pay_in_words: string | null;
}

interface MyAttendance {
  id: number; attendance_date: string; status: string; leave_type: string | null;
  in_time: string | null; out_time: string | null; worked_hours: number | null;
  overtime_hours: number; is_paid: boolean; remarks: string | null;
}

interface MyLeave {
  id: number; application_number: string; leave_name: string; is_paid: boolean;
  date_from: string; date_to: string; total_days: number; status: string;
  reason: string; approver_comments: string | null; applied_at: string | null;
}

interface MyLedger {
  id: number; leave_name: string; is_paid: boolean; year: number;
  opening_balance: number; accrued: number; availed: number; encashed: number;
  lapsed: number; closing_balance: number; available: number;
}

const STATUS_TONES: Record<string, 'default' | 'success' | 'danger' | 'warning' | 'info'> = {
  Present: 'success', 'On Duty': 'success', Late: 'warning', 'Comp Off': 'info',
  'Half Day': 'warning', Leave: 'info', Holiday: 'info', 'Weekly Off': 'default', Absent: 'danger',
};

/** Payslips: the year's earnings, and every statement behind them. */
export function MyPayslips({ canDownload }: { canDownload: boolean }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const now = new Date();
  const list = useList<MyPayslip>({
    endpoint: '/api/employee/payslips',
    initialFilters: { year: String(now.getFullYear()), month: '', search: '' },
    initialLimit: 10,
    initialSortBy: 'year',
    initialSortDir: 'desc',
  });

  const stats = (list.extra.stats ?? {}) as Record<string, number>;

  const columns: Column<MyPayslip>[] = [
    { key: 'payslip_number', header: 'Payslip', render: (row) => (
      <button type="button" onClick={() => setViewing(row.id)} className="text-left font-medium text-ink hover:text-accent">
        {row.payslip_number}
        <div className="text-xs text-ink-muted">{row.paid_days} paid day(s)</div>
      </button>
    ) },
    { key: 'month_label', header: 'Month' },
    { key: 'gross_earnings', header: 'Earnings', align: 'right', render: (row) => formatCurrency(row.gross_earnings) },
    { key: 'total_deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.total_deductions) },
    { key: 'net_pay', header: 'Net pay', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.net_pay)}</span> },
    { key: 'payment_status', header: 'Paid', align: 'center', render: (row) => (
      <div className="space-y-1">
        <Badge tone={row.payment_status === 'Paid' ? 'success' : 'default'}>{row.payment_status}</Badge>
        {row.paid_at ? <div className="text-[11px] text-ink-muted">{formatDate(row.paid_at)}{row.payment_mode ? ` · ${row.payment_mode}` : ''}</div> : null}
      </div>
    ) },
    { key: 'actions', header: 'Actions', align: 'right', width: 130, render: (row) => (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setViewing(row.id)}>View</Button>
        {canDownload ? (
          <a href={`/api/employee/payslips/${row.id}/download`} className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-surface-muted">
            Download
          </a>
        ) : null}
      </div>
    ) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Payslips published" value={formatNumber(stats.total ?? 0)} />
        <StatCard label="Net paid this year" value={formatCurrency(stats.yearToDate ?? 0)} />
        <StatCard label="Settled by the bank" value={formatNumber(stats.paidCount ?? 0)} hint="Payslips whose payment is marked paid" />
      </div>

      <Card className="overflow-hidden">
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search payslip number' },
            { key: 'year', type: 'select', label: 'Every year', options: [0, 1, 2].map((offset) => now.getFullYear() - offset).map((value) => ({ value: String(value), label: String(value) })) },
            { key: 'month', type: 'select', label: 'Every month', options: MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })) },
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
          emptyTitle="No payslips yet"
          emptySubtitle="A payslip appears here the moment payroll publishes it — download it and keep it, it is your wage record."
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {viewing ? <PayslipDetail payslipId={viewing} panel="employee" canGenerate onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

/** Attendance: the month as it was marked, which is what the wage was computed on. */
export function MyAttendance() {
  const now = new Date();
  const [window_, setWindow] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  const list = useList<MyAttendance>({
    endpoint: `/api/employee/attendance?month=${window_.month}&year=${window_.year}`,
    initialFilters: {},
    initialLimit: 31,
    initialSortBy: 'attendance_date',
    initialSortDir: 'asc',
  });

  const stats = (list.extra.stats ?? {}) as Record<string, number>;

  const columns: Column<MyAttendance>[] = [
    { key: 'attendance_date', header: 'Date', render: (row) => <span className="text-ink">{formatDate(row.attendance_date)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'default'}>{row.status}</Badge> },
    { key: 'leave_type', header: 'Leave type', render: (row) => <span className="text-ink-muted">{row.leave_type ?? '—'}</span> },
    { key: 'in_time', header: 'In / out', align: 'center', render: (row) => <span className="text-ink-muted">{row.in_time ?? '—'} / {row.out_time ?? '—'}</span> },
    { key: 'worked_hours', header: 'Hours', align: 'center', render: (row) => (row.worked_hours ? formatNumber(row.worked_hours) : '—') },
    { key: 'overtime_hours', header: 'Overtime', align: 'center', render: (row) => (Number(row.overtime_hours) ? formatNumber(row.overtime_hours) : '—') },
    { key: 'is_paid', header: 'Pay', align: 'center', render: (row) => <Badge tone={row.is_paid ? 'success' : 'danger'}>{row.is_paid ? 'Paid' : 'Deducted'}</Badge> },
    { key: 'remarks', header: 'Remarks', render: (row) => <span className="text-ink-muted">{row.remarks ?? '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present days" value={formatNumber(stats.present ?? 0)} hint={`${formatNumber(stats.absent ?? 0)} absent · ${formatNumber(stats.halfDays ?? 0)} half day(s)`} />
        <StatCard label="Leave days" value={formatNumber(stats.leaveDays ?? 0)} hint={`${formatNumber(stats.holidays ?? 0)} holiday(s)`} />
        <StatCard label="Weekly offs" value={formatNumber(stats.weeklyOffs ?? 0)} />
        <StatCard label="Overtime hours" value={formatNumber(stats.overtimeHours ?? 0)} hint={`${formatNumber(stats.workedHours ?? 0)} hour(s) worked`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">My attendance</h2>
          <div className="flex items-center gap-2">
            <Select
              value={window_.month}
              onChange={(value) => setWindow({ ...window_, month: value })}
              options={MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }))}
              size="sm"
              className="min-w-[150px]"
              clearable={false}
            />
            <Select
              value={window_.year}
              onChange={(value) => setWindow({ ...window_, year: value })}
              options={[0, 1, 2].map((offset) => now.getFullYear() - offset).map((value) => ({ value: String(value), label: String(value) }))}
              size="sm"
              className="min-w-[110px]"
              clearable={false}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="Nothing marked for this month"
          emptySubtitle="The office marks attendance as the month runs. If a day is wrong, raise it with your supervisor — the correction is what payroll will read."
        />
      </Card>
    </div>
  );
}

/** Leave: the balance, the apply form and the history with the approver's comments. */
export function MyLeave() {
  const { success, error: errorToast } = useToast();
  const [applying, setApplying] = useState(false);
  const [withdrawing, setWithdrawing] = useState<MyLeave | null>(null);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState({ leave_type_id: '', date_from: '', date_to: '', is_half_day: false, reason: '' });

  const ledger = useList<MyLedger>({
    endpoint: '/api/employee/leave/ledger',
    initialFilters: { year: String(new Date().getFullYear()) },
    initialLimit: 20,
    enabled: true,
  });

  const applications = useList<MyLeave>({
    endpoint: '/api/employee/leave',
    initialFilters: { search: '', status: 'all' },
    initialLimit: 10,
    initialSortBy: 'date_from',
    initialSortDir: 'desc',
  });

  const openApply = async () => {
    setApplying(true);
    const result = await api.get<{ id: number; name: string; is_paid: boolean; max_days_per_year: number }[]>('/api/employee/leave/types');
    const rows = Array.isArray(result.data) ? result.data : [];
    setTypes(rows.map((row) => ({ value: String(row.id), label: `${row.name}${row.is_paid ? '' : ' (unpaid)'} · ${row.max_days_per_year} day(s)/year` })));
  };

  const submit = async () => {
    try {
      const result = await api.post('/api/employee/leave', {
        employee_id: 0,
        leave_type_id: Number(form.leave_type_id),
        date_from: form.date_from,
        date_to: form.date_to,
        is_half_day: form.is_half_day,
        reason: form.reason,
      });
      success(result.message);
      setApplying(false);
      applications.refresh();
      ledger.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const ledgerColumns: Column<MyLedger>[] = [
    { key: 'leave_name', header: 'Leave type', render: (row) => <span className="text-ink">{row.leave_name}{row.is_paid ? '' : ' (unpaid)'}</span> },
    { key: 'year', header: 'Year', align: 'center' },
    { key: 'opening_balance', header: 'Opening', align: 'right', render: (row) => formatNumber(row.opening_balance) },
    { key: 'accrued', header: 'Accrued', align: 'right', render: (row) => formatNumber(row.accrued) },
    { key: 'availed', header: 'Availed', align: 'right', render: (row) => formatNumber(row.availed) },
    { key: 'encashed', header: 'Encashed', align: 'right', render: (row) => formatNumber(row.encashed) },
    { key: 'closing_balance', header: 'Balance', align: 'right', render: (row) => <span className="font-medium text-ink">{formatNumber(row.closing_balance)}</span> },
  ];

  const applicationColumns: Column<MyLeave>[] = [
    { key: 'application_number', header: 'Application', render: (row) => (
      <div className="min-w-[130px]"><div className="font-medium text-ink">{row.application_number}</div><div className="text-xs text-ink-muted">applied {formatDate(row.applied_at)}</div></div>
    ) },
    { key: 'leave_name', header: 'Leave type', render: (row) => <span className="text-ink">{row.leave_name}{row.is_paid ? '' : ' (unpaid)'}</span> },
    { key: 'dates', header: 'Dates', render: (row) => <span className="text-ink-muted">{formatDate(row.date_from)} → {formatDate(row.date_to)}</span> },
    { key: 'total_days', header: 'Days', align: 'center', render: (row) => formatNumber(row.total_days) },
    { key: 'reason', header: 'Reason', render: (row) => <span className="text-ink-muted">{row.reason}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (row) => (
      <div className="space-y-1">
        <Badge tone={row.status === 'Approved' ? 'success' : row.status === 'Rejected' ? 'danger' : row.status === 'Pending' ? 'warning' : 'default'}>{row.status}</Badge>
        {row.approver_comments ? <div className="text-[11px] text-ink-muted">{row.approver_comments}</div> : null}
      </div>
    ) },
    { key: 'actions', header: 'Actions', align: 'right', width: 110, render: (row) => (
      ['Pending', 'Approved'].includes(row.status)
        ? <Button size="sm" variant="ghost" onClick={() => setWithdrawing(row)}>Withdraw</Button>
        : <span className="text-xs text-ink-muted">—</span>
    ) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Leave balance" value={formatNumber((ledger.extra.closingTotal ?? 0) as number)} hint="Across the leave types that still have days" />
        <StatCard label="Applications" value={formatNumber(((applications.extra.stats ?? {}) as Record<string, number>).total ?? 0)} />
        <StatCard label="Awaiting a decision" value={formatNumber(((applications.extra.stats ?? {}) as Record<string, number>).pending ?? 0)} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">My leave balance</h2>
          <Button size="sm" onClick={openApply}>Apply for leave</Button>
        </div>
        <DataTable
          columns={ledgerColumns}
          data={ledger.data}
          loading={ledger.loading}
          rowKey={(row) => row.id}
          emptyTitle="No balance recorded yet"
          emptySubtitle="The office accrues your yearly entitlement — it appears here once it is done."
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">My leave history</h2>
        </div>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search application number' },
            { key: 'status', type: 'select', label: 'Every status', options: ['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((value) => ({ value, label: value })) },
          ]}
          values={applications.filters}
          onChange={applications.setFilter}
          onClear={applications.clearFilters}
        />
        <DataTable
          columns={applicationColumns}
          data={applications.data}
          loading={applications.loading}
          rowKey={(row) => row.id}
          emptyTitle="No leave applied for"
          emptySubtitle="Apply for leave here — weekly offs and holidays inside your dates are not counted against your balance."
        />
        <Pagination pagination={applications.pagination} onPageChange={applications.setPage} onLimitChange={applications.setLimit} />
      </Card>

      {applying ? (
        <Modal
          open
          onClose={() => setApplying(false)}
          title="Apply for leave"
          description="Weekly offs and the declared holidays inside your dates are not counted as leave, and the application is checked against your balance before it is submitted."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setApplying(false)}>Cancel</Button>
              <Button onClick={submit}>Submit application</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Leave type"
              value={form.leave_type_id}
              onChange={(value) => setForm({ ...form, leave_type_id: value })}
              options={types}
              placeholder="Choose the leave type"
              className="sm:col-span-2"
            />
            <Input label="From" type="date" value={form.date_from} onChange={(event) => setForm({ ...form, date_from: event.target.value })} />
            <Input label="To" type="date" value={form.date_to} onChange={(event) => setForm({ ...form, date_to: event.target.value })} />
            <Select
              label="Half day?"
              value={form.is_half_day ? 'yes' : 'no'}
              onChange={(value) => setForm({ ...form, is_half_day: value === 'yes' })}
              options={[{ value: 'no', label: 'Full day(s)' }, { value: 'yes', label: 'Half day' }]}
            />
            <Textarea label="Reason" rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="sm:col-span-2" />
          </div>
        </Modal>
      ) : null}

      {withdrawing ? (
        <ConfirmDialog
          open
          title={`Withdraw ${withdrawing.application_number}?`}
          message={withdrawing.status === 'Approved'
            ? 'Withdrawing an approved leave puts the days back into your balance and clears the attendance marked against them.'
            : 'The application is withdrawn and will no longer be considered.'}
          confirmLabel="Withdraw"
          onClose={() => setWithdrawing(null)}
          onConfirm={async () => {
            const row = withdrawing;
            setWithdrawing(null);
            try {
              const result = await api.delete(`/api/employee/leave/${row.id}`, { approver_comments: 'Withdrawn by the employee' });
              success(result.message);
              applications.refresh();
              ledger.refresh();
            } catch (failure) {
              errorToast((failure as Error).message);
            }
          }}
        />
      ) : null}
    </div>
  );
}
