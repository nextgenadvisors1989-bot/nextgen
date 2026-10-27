'use client';

/**
 * Leave monitoring — the applications, the decision, the types and the ledger.
 *
 * Four tabs, one subject. An application is approved or refused from the first
 * tab (an approval moves the ledger balance and marks the days as Leave in
 * attendance, a refusal leaves both alone). The ledger tab shows every
 * employee's opening, accrued, availed, encashed and closing balance, and
 * accrues a year's entitlement when the leave year rolls over. The types tab is
 * the establishment's own leave policy: paid or unpaid, days a year, whether a
 * document is required and whether the balance can be encashed.
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
import { Modal } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';

interface LeaveApplication {
  id: number;
  application_number: string;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  leave_name: string;
  is_paid: boolean;
  date_from: string;
  date_to: string;
  total_days: number;
  is_half_day: boolean;
  reason: string;
  status: string;
  approver_comments: string | null;
  applied_at: string | null;
  company_name: string;
}

interface LeaveLedgerRow {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  leave_name: string;
  is_paid: boolean;
  year: number;
  opening_balance: number;
  accrued: number;
  availed: number;
  encashed: number;
  lapsed: number;
  closing_balance: number;
  available: number;
}

interface LeaveTypeRow {
  id: number;
  name: string;
  name_ta: string | null;
  code: string;
  is_paid: boolean;
  max_days_per_year: number;
  carry_forward: number;
  encashable: number;
  requires_document: number;
  min_days_notice: number;
  status: string;
}

const STATUS_TONES: Record<string, 'default' | 'success' | 'danger' | 'warning'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Withdrawn: 'default',
  Cancelled: 'default',
};

export function LeaveMonitor({ panel, canDecide, canCreate }: { panel: 'admin' | 'employer'; canDecide: boolean; canCreate: boolean }) {
  const base = panel === 'admin' ? '/api/admin/payroll' : '/api/employer';
  const { success, error: errorToast } = useToast();
  const [tab, setTab] = useState('applications');
  const [deciding, setDeciding] = useState<{ row: LeaveApplication; decision: 'approve' | 'reject' } | null>(null);
  const [comments, setComments] = useState('');
  const [applying, setApplying] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<{ value: string; label: string; requiresDocument?: boolean }[]>([]);
  const [employees, setEmployees] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', date_from: '', date_to: '', is_half_day: false, reason: '' });
  const [typeForm, setTypeForm] = useState({ name: '', name_ta: '', is_paid: true, max_days_per_year: '12', carry_forward: false, encashable: false, requires_document: false, min_days_notice: '0' });
  const [typeOpen, setTypeOpen] = useState(false);
  const [accruing, setAccruing] = useState(false);

  const applications = useList<LeaveApplication>({
    endpoint: `${base}/leave`,
    initialFilters: { search: '', status: 'Pending' },
    initialLimit: 10,
    initialSortBy: 'date_from',
    initialSortDir: 'desc',
  });

  const ledger = useList<LeaveLedgerRow>({
    endpoint: `${base}/leave/ledger`,
    initialFilters: { search: '', year: String(new Date().getFullYear()) },
    initialLimit: 25,
    initialSortBy: 'employee_name',
    initialSortDir: 'asc',
    enabled: tab === 'ledger',
  });

  const types = useList<LeaveTypeRow>({
    endpoint: `${base}/leave/types`,
    initialFilters: {},
    initialLimit: 50,
    enabled: tab === 'types',
  });

  const stats = (applications.extra.stats ?? {}) as Record<string, number>;

  const decide = async () => {
    if (!deciding) return;
    try {
      const result = await api.post(`${base}/leave/${deciding.row.id}/decision`, { decision: deciding.decision, approver_comments: comments || undefined });
      success(result.message);
      setDeciding(null);
      setComments('');
      applications.refresh();
      ledger.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const openApply = async () => {
    setApplying(true);
    const [typeResult, employeeResult] = await Promise.all([
      api.get<LeaveTypeRow[]>(`${base}/leave/types`),
      api.get<{ id: number; name: string; employee_number: string }[]>(panel === 'admin' ? '/api/admin/employees?limit=200&status=active' : '/api/employer/employees?limit=200&status=active'),
    ]);
    const typeRows = Array.isArray(typeResult.data) ? typeResult.data : [];
    const employeeRows = Array.isArray(employeeResult.data) ? employeeResult.data : [];
    setLeaveTypes(typeRows.map((row) => ({ value: String(row.id), label: `${row.name}${row.is_paid ? '' : ' (unpaid)'}`, requiresDocument: Boolean(row.requires_document) })));
    setEmployees(employeeRows.map((row) => ({ value: String(row.id), label: `${row.employee_number} — ${row.name}` })));
  };

  const submitApplication = async () => {
    try {
      const result = await api.post(`${base}/leave`, {
        employee_id: Number(form.employee_id),
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

  const accrue = async () => {
    setAccruing(true);
    try {
      const result = await api.post(`${base}/leave/ledger`, { year: Number(ledger.filters.year || new Date().getFullYear()) });
      success(result.message);
      ledger.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    } finally {
      setAccruing(false);
    }
  };

  const addType = async () => {
    try {
      const result = await api.post(`${base}/leave/types`, {
        name: typeForm.name,
        name_ta: typeForm.name_ta || undefined,
        is_paid: typeForm.is_paid,
        max_days_per_year: Number(typeForm.max_days_per_year || 12),
        carry_forward: typeForm.carry_forward,
        encashable: typeForm.encashable,
        requires_document: typeForm.requires_document,
        min_days_notice: Number(typeForm.min_days_notice || 0),
      });
      success(result.message);
      setTypeOpen(false);
      types.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const applicationColumns: Column<LeaveApplication>[] = [
    {
      key: 'application_number',
      header: 'Application',
      render: (row) => (
        <div className="min-w-[130px]">
          <div className="font-medium text-ink">{row.application_number}</div>
          <div className="text-xs text-ink-muted">{formatDate(row.applied_at)}</div>
        </div>
      ),
    },
    {
      key: 'employee_name',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-[170px]">
          <div className="text-ink">{row.employee_name}</div>
          <div className="text-xs text-ink-muted">{row.employee_number}</div>
        </div>
      ),
    },
    ...(panel === 'admin' ? [{ key: 'company_name', header: 'Company', render: (row: LeaveApplication) => <span className="text-ink-muted">{row.company_name}</span> }] : []),
    { key: 'leave_name', header: 'Leave type', render: (row) => (<span className="text-ink">{row.leave_name}{row.is_paid ? '' : ' (unpaid)'}</span>) },
    { key: 'dates', header: 'Dates', render: (row) => (<span className="text-ink-muted">{formatDate(row.date_from)} → {formatDate(row.date_to)}</span>) },
    { key: 'total_days', header: 'Days', align: 'center', render: (row) => formatNumber(row.total_days) },
    { key: 'reason', header: 'Reason', render: (row) => <span className="text-ink-muted">{row.reason}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'default'}>{row.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 120,
      render: (row) => (
        row.status === 'Pending' && canDecide ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setDeciding({ row, decision: 'approve' })}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => setDeciding({ row, decision: 'reject' })}>Refuse</Button>
          </div>
        ) : <span className="text-xs text-ink-muted">{row.approver_comments ?? '—'}</span>
      ),
    },
  ];

  const ledgerColumns: Column<LeaveLedgerRow>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-[170px]">
          <div className="text-ink">{row.employee_name}</div>
          <div className="text-xs text-ink-muted">{row.employee_number}</div>
        </div>
      ),
    },
    { key: 'leave_name', header: 'Leave type', render: (row) => <span className="text-ink">{row.leave_name}{row.is_paid ? '' : ' (unpaid)'}</span> },
    { key: 'year', header: 'Year', align: 'center' },
    { key: 'opening_balance', header: 'Opening', align: 'right', render: (row) => formatNumber(row.opening_balance) },
    { key: 'accrued', header: 'Accrued', align: 'right', render: (row) => formatNumber(row.accrued) },
    { key: 'availed', header: 'Availed', align: 'right', render: (row) => formatNumber(row.availed) },
    { key: 'encashed', header: 'Encashed', align: 'right', render: (row) => formatNumber(row.encashed) },
    { key: 'lapsed', header: 'Lapsed', align: 'right', render: (row) => formatNumber(row.lapsed) },
    { key: 'closing_balance', header: 'Balance', align: 'right', render: (row) => <span className="font-medium text-ink">{formatNumber(row.closing_balance)}</span> },
  ];

  const typeColumns: Column<LeaveTypeRow>[] = [
    { key: 'name', header: 'Leave type', render: (row) => (
      <div>
        <div className="font-medium text-ink">{row.name}</div>
        {row.name_ta ? <div className="text-xs text-ink-muted">{row.name_ta}</div> : null}
      </div>
    ) },
    { key: 'is_paid', header: 'Paid', align: 'center', render: (row) => <Badge tone={row.is_paid ? 'success' : 'warning'}>{row.is_paid ? 'Paid' : 'Unpaid'}</Badge> },
    { key: 'max_days_per_year', header: 'Days a year', align: 'center', render: (row) => formatNumber(row.max_days_per_year) },
    { key: 'carry_forward', header: 'Carry forward', align: 'center', render: (row) => (Number(row.carry_forward) ? 'Yes' : 'No') },
    { key: 'encashable', header: 'Encashable', align: 'center', render: (row) => (Number(row.encashable) ? 'Yes' : 'No') },
    { key: 'requires_document', header: 'Document', align: 'center', render: (row) => (Number(row.requires_document) ? 'Required' : 'Not required') },
    { key: 'min_days_notice', header: 'Notice', align: 'center', render: (row) => `${formatNumber(row.min_days_notice)} day(s)` },
    { key: 'status', header: 'Status', align: 'center', render: (row) => <Badge tone={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications" value={formatNumber(stats.total ?? 0)} hint={`${formatNumber(stats.pending ?? 0)} awaiting a decision`} />
        <StatCard label="Approved" value={formatNumber(stats.approved ?? 0)} />
        <StatCard label="Paid leave days" value={formatNumber(stats.paid_days ?? 0)} />
        <StatCard label="Unpaid leave days" value={formatNumber(stats.unpaid_days ?? 0)} hint="These reduce the wage for the month" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4">
          <div className="flex flex-wrap items-center gap-1 py-1">
            {[
              { key: 'applications', label: 'Applications' },
              { key: 'ledger', label: 'Leave ledger' },
              { key: 'types', label: 'Leave types' },
            ].map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={
                  tab === entry.key
                    ? 'border-b-2 border-accent px-3 py-2 text-[13px] font-semibold text-ink'
                    : 'border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-ink-muted hover:text-ink'
                }
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'applications' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="text-[13px] text-ink-muted">
                Approving moves the employee&apos;s ledger balance and marks the days as Leave in attendance; refusing leaves both untouched.
                The employee is told in the portal, by email and by SMS.
              </p>
              {canCreate ? <Button size="sm" onClick={openApply}>Record an application</Button> : null}
            </div>
            <Filters
              definitions={[
                { key: 'search', type: 'search', placeholder: 'Search application number or employee' },
                { key: 'status', type: 'select', label: 'Every status', options: ['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((value) => ({ value, label: value })) },
                { key: 'from_date', type: 'date', label: 'From' },
                { key: 'to_date', type: 'date', label: 'To' },
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
              emptyTitle="No leave applications"
              emptySubtitle="Applications raised by employees appear here for a decision."
            />
            <Pagination pagination={applications.pagination} onPageChange={applications.setPage} onLimitChange={applications.setLimit} />
          </>
        ) : null}

        {tab === 'ledger' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="text-[13px] text-ink-muted">
                The ledger is what the apply form checks before it accepts a request. Accruing a year tops up every active employee for
                each leave type without duplicating an existing entry.
              </p>
              {canCreate ? <Button size="sm" loading={accruing} onClick={accrue}>Accrue {ledger.filters.year} entitlements</Button> : null}
            </div>
            <Filters
              definitions={[
                { key: 'search', type: 'search', placeholder: 'Search employee' },
                { key: 'year', type: 'select', label: 'Every year', options: [0, 1, 2].map((offset) => new Date().getFullYear() - offset).map((value) => ({ value: String(value), label: String(value) })) },
              ]}
              values={ledger.filters}
              onChange={ledger.setFilter}
              onClear={ledger.clearFilters}
            />
            <DataTable
              columns={ledgerColumns}
              data={ledger.data}
              loading={ledger.loading}
              rowKey={(row) => row.id}
              emptyTitle="No leave balances yet"
              emptySubtitle={`Accrue the ${ledger.filters.year} entitlements to open every employee's ledger for the year.`}
            />
            <Pagination pagination={ledger.pagination} onPageChange={ledger.setPage} onLimitChange={ledger.setLimit} />
          </>
        ) : null}

        {tab === 'types' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="text-[13px] text-ink-muted">
                The establishment&apos;s leave policy: what an employee may apply for, how much of it a year, and whether the balance can be
                encashed at settlement.
              </p>
              {canCreate ? <Button size="sm" onClick={() => setTypeOpen(true)}>Add a leave type</Button> : null}
            </div>
            <DataTable
              columns={typeColumns}
              data={types.data}
              loading={types.loading}
              rowKey={(row) => row.id}
              emptyTitle="No leave types configured"
              emptySubtitle="Add the leave types this establishment grants before accruing balances."
            />
          </>
        ) : null}
      </Card>

      {deciding ? (
        <Modal
          open
          onClose={() => setDeciding(null)}
          title={deciding.decision === 'approve' ? 'Approve the application' : 'Refuse the application'}
          description={`${deciding.row.employee_name} · ${deciding.row.leave_name} · ${formatDate(deciding.row.date_from)} to ${formatDate(deciding.row.date_to)} (${deciding.row.total_days} day(s))`}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button variant={deciding.decision === 'approve' ? 'primary' : 'danger'} onClick={decide}>
                {deciding.decision === 'approve' ? 'Approve leave' : 'Refuse leave'}
              </Button>
            </div>
          }
        >
          <Textarea
            label="Comments for the employee"
            rows={3}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            placeholder={deciding.decision === 'approve' ? 'Approved — enjoy the break.' : 'Refused — the balance is not available for these dates.'}
          />
          {deciding.decision === 'approve' ? (
            <p className="mt-3 text-[13px] text-ink-muted">
              On approval the ledger balance moves by {deciding.row.total_days} day(s) and the days are marked as Leave in attendance, which
              is what the payroll engine reads.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {applying ? (
        <Modal
          open
          onClose={() => setApplying(false)}
          title="Record a leave application"
          description="The paper form the office enters on an employee's behalf — the balance and the working-day checks are the same ones the employee's own application goes through."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setApplying(false)}>Cancel</Button>
              <Button onClick={submitApplication}>Submit application</Button>
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
            <Select
              label="Leave type"
              value={form.leave_type_id}
              onChange={(value) => setForm({ ...form, leave_type_id: value })}
              options={leaveTypes}
              placeholder="Choose the leave type"
            />
            <Select
              label="Half day?"
              value={form.is_half_day ? 'yes' : 'no'}
              onChange={(value) => setForm({ ...form, is_half_day: value === 'yes' })}
              options={[{ value: 'no', label: 'Full day(s)' }, { value: 'yes', label: 'Half day' }]}
            />
            <Input label="From" type="date" value={form.date_from} onChange={(event) => setForm({ ...form, date_from: event.target.value })} />
            <Input label="To" type="date" value={form.date_to} onChange={(event) => setForm({ ...form, date_to: event.target.value })} />
            <Textarea label="Reason" rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="sm:col-span-2" />
          </div>
        </Modal>
      ) : null}

      {typeOpen ? (
        <Modal
          open
          onClose={() => setTypeOpen(false)}
          title="Add a leave type"
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTypeOpen(false)}>Cancel</Button>
              <Button onClick={addType}>Add leave type</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" value={typeForm.name} onChange={(event) => setTypeForm({ ...typeForm, name: event.target.value })} placeholder="e.g. Maternity Leave" />
            <Input label="Tamil name" value={typeForm.name_ta} onChange={(event) => setTypeForm({ ...typeForm, name_ta: event.target.value })} placeholder="தாய்மை விடுப்பு" />
            <Input label="Days a year" type="number" value={typeForm.max_days_per_year} onChange={(event) => setTypeForm({ ...typeForm, max_days_per_year: event.target.value })} />
            <Input label="Minimum notice (days)" type="number" value={typeForm.min_days_notice} onChange={(event) => setTypeForm({ ...typeForm, min_days_notice: event.target.value })} />
            <Select label="Paid" value={typeForm.is_paid ? 'yes' : 'no'} onChange={(value) => setTypeForm({ ...typeForm, is_paid: value === 'yes' })} options={[{ value: 'yes', label: 'Paid leave' }, { value: 'no', label: 'Unpaid leave (loss of pay)' }]} />
            <Select label="Carry forward" value={typeForm.carry_forward ? 'yes' : 'no'} onChange={(value) => setTypeForm({ ...typeForm, carry_forward: value === 'yes' })} options={[{ value: 'no', label: 'Lapses at year end' }, { value: 'yes', label: 'Carries forward' }]} />
            <Select label="Encashable" value={typeForm.encashable ? 'yes' : 'no'} onChange={(value) => setTypeForm({ ...typeForm, encashable: value === 'yes' })} options={[{ value: 'no', label: 'Not encashable' }, { value: 'yes', label: 'Encashable at settlement' }]} />
            <Select label="Supporting document" value={typeForm.requires_document ? 'yes' : 'no'} onChange={(value) => setTypeForm({ ...typeForm, requires_document: value === 'yes' })} options={[{ value: 'no', label: 'Not required' }, { value: 'yes', label: 'Required with the application' }]} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
