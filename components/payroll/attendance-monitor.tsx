'use client';

/**
 * Attendance register — the days payroll counts.
 *
 * Two ways in, because establishments work two ways: the daily register marks one
 * employee on one day (and corrects it, because the same employee and date
 * updates rather than duplicates), and the month sheet marks a whole scope in one
 * pass — every working day takes the default status, the named exceptions
 * override the days they list, and the weekly offs and holidays come from the
 * calendar so a Sunday is never counted as an absence.
 */
import { useState } from 'react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';
import { formatDate, MONTH_NAMES } from '@/lib/utils/dates';
import { ATTENDANCE_STATUSES } from '@/lib/validations/payroll.validation';

interface AttendanceRow {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  company_name: string;
  attendance_date: string;
  status: string;
  leave_type: string | null;
  in_time: string | null;
  out_time: string | null;
  worked_hours: number | null;
  overtime_hours: number;
  late_minutes: number;
  is_paid: boolean;
  source: string;
  remarks: string | null;
}

interface EmployeeOption { value: string; label: string; employerId?: number | null }

const STATUS_TONES: Record<string, 'default' | 'success' | 'danger' | 'warning' | 'info'> = {
  Present: 'success',
  'On Duty': 'success',
  Late: 'warning',
  'Comp Off': 'info',
  'Half Day': 'warning',
  Leave: 'info',
  Holiday: 'info',
  'Weekly Off': 'default',
  Absent: 'danger',
};

export function AttendanceMonitor({
  panel, canCreate, canBulk,
}: {
  panel: 'admin' | 'employer';
  canCreate: boolean;
  canBulk: boolean;
}) {
  const base = panel === 'admin' ? '/api/admin/payroll' : '/api/employer';
  const { success, error: errorToast } = useToast();
  const now = new Date();
  const [marking, setMarking] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [form, setForm] = useState({
    employee_id: '', attendance_date: now.toISOString().slice(0, 10), status: 'Present',
    leave_type: '', in_time: '', out_time: '', worked_hours: '', overtime_hours: '', remarks: '',
  });
  const [bulk, setBulk] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()), default_status: 'Present' });
  const [bulkBusy, setBulkBusy] = useState(false);

  const list = useList<AttendanceRow>({
    endpoint: panel === 'admin' ? '/api/admin/payroll/attendance' : '/api/employer/attendance',
    initialFilters: { search: '', status: 'all', month: String(now.getMonth() + 1), year: String(now.getFullYear()) },
    initialLimit: 10,
    initialSortBy: 'attendance_date',
    initialSortDir: 'desc',
  });

  const stats = (list.extra.stats ?? {}) as Record<string, number>;

  const loadEmployees = async () => {
    const endpoint = panel === 'admin' ? '/api/admin/employees?limit=200&status=active' : '/api/employer/employees?limit=200&status=active';
    const result = await api.get<{ id: number; name: string; employee_number: string; designation?: string | null }[]>(endpoint);
    const rows = Array.isArray(result.data) ? result.data : [];
    setEmployees(rows.map((row) => ({ value: String(row.id), label: `${row.employee_number} — ${row.name}` })));
  };

  const openMark = async () => {
    setMarking(true);
    await loadEmployees();
  };

  const saveOne = async () => {
    if (!form.employee_id) {
      errorToast('Choose the employee first');
      return;
    }
    try {
      const result = await api.post(panel === 'admin' ? `${base}/attendance` : `${base}/attendance`, {
        employee_id: Number(form.employee_id),
        attendance_date: form.attendance_date,
        status: form.status,
        leave_type: form.leave_type || undefined,
        in_time: form.in_time || undefined,
        out_time: form.out_time || undefined,
        worked_hours: form.worked_hours ? Number(form.worked_hours) : undefined,
        overtime_hours: form.overtime_hours ? Number(form.overtime_hours) : undefined,
        remarks: form.remarks || undefined,
      });
      success(result.message);
      setMarking(false);
      list.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const saveBulk = async () => {
    setBulkBusy(true);
    try {
      const result = await api.put(`${base}/attendance`, {
        ...(panel === 'admin' ? {} : {}),
        month: Number(bulk.month),
        year: Number(bulk.year),
        default_status: bulk.default_status,
        ...(panel === 'admin' && employees[0]?.employerId ? { employer_id: employees[0].employerId } : {}),
      });
      success(result.message);
      setBulkOpen(false);
      list.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: Column<AttendanceRow>[] = [
    { key: 'attendance_date', header: 'Date', render: (row) => <span className="text-ink">{formatDate(row.attendance_date)}</span> },
    {
      key: 'employee_name',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-[170px]">
          <div className="text-ink">{row.employee_name}</div>
          <div className="text-xs text-ink-muted">{row.employee_number}{row.designation ? ` · ${row.designation}` : ''}</div>
        </div>
      ),
    },
    ...(panel === 'admin' ? [{ key: 'company_name', header: 'Company', render: (row: AttendanceRow) => <span className="text-ink-muted">{row.company_name}</span> }] : []),
    { key: 'status', header: 'Status', align: 'center', render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'default'}>{row.status}</Badge> },
    { key: 'leave_type', header: 'Leave type', render: (row) => <span className="text-ink-muted">{row.leave_type ?? '—'}</span> },
    {
      key: 'in_time',
      header: 'In / out',
      align: 'center',
      render: (row) => <span className="text-ink-muted">{row.in_time ?? '—'} / {row.out_time ?? '—'}</span>,
    },
    { key: 'worked_hours', header: 'Worked', align: 'center', render: (row) => (row.worked_hours ? formatNumber(row.worked_hours) : '—') },
    { key: 'overtime_hours', header: 'OT', align: 'center', render: (row) => (Number(row.overtime_hours) ? formatNumber(row.overtime_hours) : '—') },
    { key: 'is_paid', header: 'Paid', align: 'center', render: (row) => <Badge tone={row.is_paid ? 'success' : 'danger'}>{row.is_paid ? 'Paid' : 'Loss of pay'}</Badge> },
    { key: 'source', header: 'Source', align: 'center', render: (row) => <span className="text-ink-muted">{row.source}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Marked days" value={formatNumber(stats.total ?? 0)} hint={`${formatNumber(stats.present ?? 0)} present · ${formatNumber(stats.absent ?? 0)} absent`} />
        <StatCard label="Leave days" value={formatNumber(stats.leaveDays ?? 0)} hint={`${formatNumber(stats.holidays ?? 0)} holidays · ${formatNumber(stats.weeklyOffs ?? 0)} weekly offs`} />
        <StatCard label="Overtime hours" value={formatNumber(stats.overtimeHours ?? 0)} hint="Paid at twice the ordinary rate" />
        <StatCard label="Half days" value={formatNumber(stats.halfDays ?? 0)} hint={`${formatNumber(stats.workedHours ?? 0)} hour(s) worked in total`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Attendance register</h2>
          <div className="flex items-center gap-2">
            {canBulk ? <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>Mark a month in bulk</Button> : null}
            {canCreate ? <Button size="sm" onClick={openMark}>Mark a day</Button> : null}
          </div>
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search employee or remarks' },
            { key: 'status', type: 'select', label: 'Every status', options: ATTENDANCE_STATUSES.map((value) => ({ value, label: value })) },
            { key: 'month', type: 'select', label: 'Every month', options: MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })) },
            { key: 'year', type: 'select', label: 'Every year', options: [0, 1, 2].map((offset) => now.getFullYear() - offset).map((value) => ({ value: String(value), label: String(value) })) },
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
          emptyTitle="No attendance marked for this period"
          emptySubtitle="Mark the month in bulk and then correct the individual days — payroll counts what is recorded here."
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {marking ? (
        <Modal
          open
          onClose={() => setMarking(false)}
          title="Mark attendance for a day"
          description="Marking the same employee and date again corrects that day rather than adding a second record."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMarking(false)}>Cancel</Button>
              <Button onClick={saveOne}>Save day</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Employee</label>
              <SearchInput
                value={employees.find((option) => option.value === form.employee_id)?.label ?? ''}
                onChange={(value) => {
                  const match = employees.find((option) => option.label === value)
                    ?? employees.find((option) => option.label.toLowerCase().includes(value.toLowerCase()));
                  setForm({ ...form, employee_id: match?.value ?? '' });
                }}
                placeholder="Search by name or employee code"
              />
            </div>
            <Input label="Date" type="date" value={form.attendance_date} onChange={(event) => setForm({ ...form, attendance_date: event.target.value })} />
            <Select
              label="Status"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={ATTENDANCE_STATUSES.map((value) => ({ value, label: value }))}
            />
            {form.status === 'Leave' ? (
              <Input label="Leave type" value={form.leave_type} onChange={(event) => setForm({ ...form, leave_type: event.target.value })} placeholder="Casual Leave, Sick Leave…" />
            ) : null}
            <Input label="In time" type="time" value={form.in_time} onChange={(event) => setForm({ ...form, in_time: event.target.value })} />
            <Input label="Out time" type="time" value={form.out_time} onChange={(event) => setForm({ ...form, out_time: event.target.value })} />
            <Input label="Worked hours" type="number" value={form.worked_hours} onChange={(event) => setForm({ ...form, worked_hours: event.target.value })} />
            <Input label="Overtime hours" type="number" value={form.overtime_hours} onChange={(event) => setForm({ ...form, overtime_hours: event.target.value })} helper="Paid at twice the ordinary rate (÷26 days ÷ 8 hours)" />
            <Input label="Remarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} className="sm:col-span-2" />
          </div>
        </Modal>
      ) : null}

      {bulkOpen ? (
        <Modal
          open
          onClose={() => setBulkOpen(false)}
          title="Mark a month in bulk"
          description="Every employee in scope gets the default status on every working day of the month. Weekly offs and the declared holidays are filled from the calendar, and an existing mark is updated rather than duplicated."
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button loading={bulkBusy} onClick={saveBulk}>Mark the month</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Month" value={bulk.month} onChange={(value) => setBulk({ ...bulk, month: value })} options={MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label }))} />
            <Input label="Year" type="number" value={bulk.year} onChange={(event) => setBulk({ ...bulk, year: event.target.value })} />
            <Select
              label="Default status for working days"
              value={bulk.default_status}
              onChange={(value) => setBulk({ ...bulk, default_status: value })}
              options={ATTENDANCE_STATUSES.map((value) => ({ value, label: value }))}
              className="sm:col-span-2"
            />
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">
            After the month is marked, open the register and correct the individual absences and overtime hours — those corrections
            are what the payroll engine reads.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
