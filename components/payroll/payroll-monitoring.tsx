'use client';

/**
 * Payroll monitoring — the run register and the month's numbers.
 *
 * One component serves both panels: the administrator's copy spans every
 * company and can create a run for any of them, the employer's copy is scoped by
 * the session to its own company and cannot pick another. The endpoints differ
 * only by prefix, so `panel` decides the API base rather than duplicating a
 * screen that would drift.
 *
 * The lifecycle buttons follow the run's own state machine — calculate while
 * draft, approve when calculated, lock when approved, pay when locked — so the
 * screen never offers a step the service would refuse.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { MONTH_NAMES } from '@/lib/utils/dates';

interface RunRow {
  id: number;
  run_number: string;
  company_name: string;
  employer_code: string;
  unit_name: string | null;
  department_name: string | null;
  month: number;
  year: number;
  month_label: string;
  period_from: string | null;
  period_to: string | null;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  payslip_count: number;
  status: string;
  bank_file_generated_at: string | null;
  processed_at: string | null;
}

interface Overview {
  month: number;
  year: number;
  monthLabel: string;
  stats: { total: number; draft: number; calculated: number; approved: number; locked: number; paid: number; cancelled: number; gross: number; net: number; deductions: number; pf: number; esi: number; pt: number; lwf: number };
  slips: { total: number; gross: number; net: number; deductions: number; pf_employee: number; pf_employer: number; esi_employee: number; esi_employer: number; pt: number; lwf: number; unpaid: number; published: number };
  trend: { month: number; label: string; gross: number; net: number; pf: number; esi: number; employees: number; runs: number }[];
  outstanding: { employer_id: number; company_name: string; employer_code: string; employees: number }[];
  employers: { value: string; label: string; hint?: string }[];
}

const STATUS_TONES: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  Draft: 'default',
  Calculated: 'info',
  Approved: 'warning',
  Locked: 'info',
  Paid: 'success',
  Cancelled: 'danger',
};

const NEXT_STEP: Record<string, { label: string; status: string; tone: 'primary' | 'secondary' } | null> = {
  Draft: { label: 'Calculate', status: 'Calculated', tone: 'primary' },
  Calculated: { label: 'Approve', status: 'Approved', tone: 'primary' },
  Approved: { label: 'Lock', status: 'Locked', tone: 'primary' },
  Locked: { label: 'Mark paid', status: 'Paid', tone: 'primary' },
  Paid: null,
  Cancelled: null,
};

export function PayrollMonitoring({
  panel, canCreate, canUpdate, canExport, canPublish, openCreateOnMount = false,
}: {
  panel: 'admin' | 'employer';
  canCreate: boolean;
  canUpdate: boolean;
  canExport: boolean;
  canPublish: boolean;
  /** The Run Payroll screen opens straight into the dialog. */
  openCreateOnMount?: boolean;
}) {
  const base = panel === 'admin' ? '/api/admin/payroll' : '/api/employer/payroll';
  const { success, error: errorToast } = useToast();
  // Opened after mount, not during the first render: the modal is client-only, so rendering it
  // open on the server and again on the client is a hydration mismatch.
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (openCreateOnMount && canCreate) setCreating(true); }, [openCreateOnMount, canCreate]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RunRow | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const list = useList<RunRow>({
    endpoint: base,
    initialFilters: { search: '', status: 'all', month: '', year: String(new Date().getFullYear()) },
    initialLimit: 10,
    initialSortBy: 'period_to',
    initialSortDir: 'desc',
  });

  // The dashboard payload is fetched alongside the table; a refresh of either
  // refreshes both so the cards and the rows never disagree.
  useMemo(() => {
    let alive = true;
    const params = new URLSearchParams();
    if (list.filters.year) params.set('year', list.filters.year);
    if (list.filters.month) params.set('month', list.filters.month);
    api.get<Overview>(`${base}/overview?${params.toString()}`).then((result) => {
      if (alive) setOverview(result.data ?? null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, list.filters.year, list.filters.month, list.pagination.total, reloadKey]);

  const stats = overview?.stats;
  const slips = overview?.slips;

  const runAction = async (run: RunRow, action: 'calculate' | 'publish' | 'generate' | 'status', status?: string) => {
    setBusyId(run.id);
    try {
      if (action === 'calculate') {
        const result = await api.post<{ payslips: unknown[] }>(`${base}/${run.id}/calculate`);
        success(result.message ?? `Payroll ${run.run_number} calculated`);
      } else if (action === 'publish') {
        const result = await api.post<{ published: number }>(`${base}/${run.id}/publish`);
        success(result.message ?? 'Payslips published');
      } else if (action === 'generate') {
        const result = await api.post<{ generated: number; total: number }>(`${base}/${run.id}/generate`);
        success(result.message ?? 'Payslip PDFs generated');
      } else {
        const result = await api.post(`${base}/${run.id}/status`, { status });
        success(result.message ?? `Run is now ${status}`);
      }
      list.refresh();
      setReloadKey((key) => key + 1);
    } catch (failure) {
      errorToast((failure as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const downloadBankFile = (run: RunRow, format: string) => {
    window.open(`${base}/${run.id}/bank-file?format=${format}`, '_blank');
  };

  const columns: Column<RunRow>[] = [
    {
      key: 'run_number',
      header: 'Run',
      render: (row) => (
        <div className="min-w-[150px]">
          <Link href={`${panel === 'admin' ? '/admin/payroll-runs' : '/employer/payroll'}/${row.id}`} className="font-medium text-ink hover:text-accent">
            {row.run_number}
          </Link>
          <div className="text-xs text-ink-muted">{row.month_label}</div>
        </div>
      ),
    },
    ...(panel === 'admin'
      ? [{
          key: 'company_name',
          header: 'Company',
          render: (row: RunRow) => (
            <div className="min-w-[180px]">
              <div className="text-ink">{row.company_name}</div>
              <div className="text-xs text-ink-muted">
                {row.employer_code}
                {row.unit_name ? ` · ${row.unit_name}` : ''}
                {row.department_name ? ` · ${row.department_name}` : ''}
              </div>
            </div>
          ),
        }]
      : []),
    { key: 'total_employees', header: 'Employees', align: 'center', render: (row) => formatNumber(row.total_employees) },
    { key: 'total_gross', header: 'Gross', align: 'right', render: (row) => formatCurrency(row.total_gross) },
    { key: 'total_deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.total_deductions) },
    { key: 'total_net', header: 'Net payable', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.total_net)}</span> },
    { key: 'payslip_count', header: 'Payslips', align: 'center', render: (row) => formatNumber(row.payslip_count) },
    { key: 'status', header: 'Status', align: 'center', render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'default'}>{row.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 120,
      render: (row) => {
        const next = NEXT_STEP[row.status];
        return (
          <div className="flex items-center justify-end gap-1.5">
            {canUpdate && next ? (
              <Button
                size="sm"
                variant="ghost"
                loading={busyId === row.id}
                onClick={() => runAction(row, 'status', next.status)}
              >
                {next.label}
              </Button>
            ) : null}
            <LinkButton size="sm" variant="ghost" href={`${panel === 'admin' ? '/admin/payroll-runs' : '/employer/payroll'}/${row.id}`}>
              Open
            </LinkButton>
          </div>
        );
      },
    },
  ];

  const monthOptions = MONTH_NAMES.map((label, index: number) => ({ value: String(index + 1), label }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Runs in ${overview?.monthLabel ?? 'the year'}`} value={formatNumber(stats?.total ?? 0)} hint={`${formatNumber(stats?.paid ?? 0)} paid · ${formatNumber(stats?.draft ?? 0)} draft`} />
        <StatCard label="Gross payroll" value={formatCurrency(stats?.gross ?? 0)} hint={`${formatNumber(slips?.total ?? 0)} payslip(s) this month`} />
        <StatCard label="Net payable" value={formatCurrency(stats?.net ?? 0)} hint={`Deductions ${formatCurrency(stats?.deductions ?? 0)}`} />
        <StatCard
          label="Statutory deductions"
          value={formatCurrency((stats?.pf ?? 0) + (stats?.esi ?? 0) + (stats?.pt ?? 0) + (stats?.lwf ?? 0))}
          hint={`PF ${formatCurrency(stats?.pf ?? 0)} · ESI ${formatCurrency(stats?.esi ?? 0)}`}
        />
      </div>

      {overview?.outstanding.length ? (
        <Card className="border-l-4 border-l-amber-400 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Payroll not run for {overview.monthLabel}
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                {overview.outstanding.length} company/companies have active employees and no run for the month — the first-of-month
                reminder job chases these automatically.
              </p>
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overview.outstanding.slice(0, 12).map((entry) => (
              <li key={entry.employer_id} className="rounded-md border border-line bg-surface-muted px-2.5 py-1 text-[13px] text-ink">
                {entry.company_name} <span className="text-ink-muted">· {entry.employees} employee(s)</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Payroll runs</h2>
          <div className="flex items-center gap-2">
            {canExport ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(`${base}/register?download=csv&${new URLSearchParams({ ...list.filters, limit: '1000' }).toString()}`, '_blank')}
              >
                Export pay register
              </Button>
            ) : null}
            {canCreate ? (
              <Button size="sm" onClick={() => setCreating(true)}>New payroll run</Button>
            ) : null}
          </div>
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search run number or company' },
            { key: 'status', type: 'select', label: 'All statuses', options: ['Draft', 'Calculated', 'Approved', 'Locked', 'Paid', 'Cancelled'].map((value) => ({ value, label: value })) },
            { key: 'month', type: 'select', label: 'Every month', options: monthOptions },
            { key: 'year', type: 'select', label: 'Every year', options: [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((value) => ({ value: String(value), label: String(value) })) },
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
          emptyTitle="No payroll run yet"
          emptySubtitle={canCreate ? 'Create a run for a month and calculate it — the engine builds one payslip per employee from their structure and attendance.' : 'Runs appear here once they are created.'}
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {overview ? (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Twelve-month payroll trend ({overview.year})</h2>
            <span className="text-[13px] text-ink-muted">{formatNumber(slips?.total ?? 0)} payslip(s) in the selected month</span>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" fontSize={12} stroke="#6b7280" />
                <YAxis fontSize={12} stroke="#6b7280" tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="gross" name="Gross" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="net" name="Net" fill="#1e293b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pf" name="PF" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      {creating ? (
        <CreateRunModal
          base={base}
          employers={overview?.employers ?? []}
          panel={panel}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            success(message);
            setCreating(false);
            list.refresh();
            setReloadKey((key) => key + 1);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          open
          title={`Withdraw ${confirmDelete.run_number}?`}
          message="The run leaves the register and its payslips are withdrawn with it. Use this only for a run raised in error — a paid run is the record of money that moved."
          confirmLabel="Withdraw run"
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const run = confirmDelete;
            setConfirmDelete(null);
            try {
              await api.delete(`${base}/${run.id}`, { confirm: true, reason: 'Withdrawn from the monitoring screen' });
              success(`${run.run_number} withdrawn`);
              list.refresh();
              setReloadKey((key) => key + 1);
            } catch (failure) {
              errorToast((failure as Error).message);
            }
          }}
        />
      ) : null}

      {canPublish && list.data.some((row) => ['Calculated', 'Approved', 'Locked', 'Paid'].includes(row.status)) ? (
        <p className="text-[13px] text-ink-muted">
          Publish a calculated run to send every employee their payslip in the portal, by email and — where a mobile number is on
          record — by SMS and WhatsApp. Generate the PDFs first and the employee&apos;s copy is the same file that went out.
        </p>
      ) : null}
    </div>
  );
}

/** Create-run dialog: company (admin only), unit, department, month and year. */
function CreateRunModal({
  base, employers, panel, onClose, onCreated,
}: {
  base: string;
  employers: { value: string; label: string; hint?: string }[];
  panel: 'admin' | 'employer';
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const { error: errorToast } = useToast();
  const now = new Date();
  const monthOptions = MONTH_NAMES.map((label, index: number) => ({ value: String(index + 1), label }));
  const [form, setForm] = useState({
    employer_id: employers[0]?.value ?? '',
    unit_id: '',
    department_id: '',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    period_from: '',
    period_to: '',
    calculation_notes: '',
  });
  const [units, setUnits] = useState<{ value: string; label: string }[]>([]);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    let alive = true;
    api.get<{ units: { value: string; label: string; employerId: number }[]; departments: { value: string; label: string; employerId: number }[] }>(`${base}/options`).then((result) => {
      if (!alive) return;
      const employerId = Number(form.employer_id || employers[0]?.value || 0);
      const options = result.data ?? { units: [], departments: [] };
      setUnits((options.units ?? []).filter((unit) => !employerId || unit.employerId === employerId).map((unit) => ({ value: unit.value, label: unit.label })));
      setDepartments((options.departments ?? []).filter((department) => !employerId || department.employerId === employerId).map((department) => ({ value: department.value, label: department.label })));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, form.employer_id]);

  const submit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        month: Number(form.month),
        year: Number(form.year),
        unit_id: form.unit_id ? Number(form.unit_id) : undefined,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        period_from: form.period_from || undefined,
        period_to: form.period_to || undefined,
        calculation_notes: form.calculation_notes || undefined,
      };
      if (panel === 'admin') payload.employer_id = Number(form.employer_id || employers[0]?.value);
      const result = await api.post<{ run_number: string; month_label: string }>(base, payload);
      onCreated(result.data?.run_number ? `Payroll run ${result.data.run_number} created` : result.message);
    } catch (failure) {
      errorToast((failure as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New payroll run"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Create run</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {panel === 'admin' ? (
          <Select
            label="Company"
            value={form.employer_id}
            onChange={(value) => setForm({ ...form, employer_id: value, unit_id: '', department_id: '' })}
            options={employers.map((employer) => ({ value: employer.value, label: employer.hint ? `${employer.label} (${employer.hint})` : employer.label }))}
            placeholder="Choose the company"
            className="sm:col-span-2"
          />
        ) : null}
        <Select label="Unit" value={form.unit_id} onChange={(value) => setForm({ ...form, unit_id: value })} options={[{ value: '', label: 'Every unit' }, ...units]} />
        <Select label="Department" value={form.department_id} onChange={(value) => setForm({ ...form, department_id: value })} options={[{ value: '', label: 'Every department' }, ...departments]} />
        <Select label="Month" value={form.month} onChange={(value) => setForm({ ...form, month: value })} options={monthOptions} />
        <Input label="Year" type="number" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} />
        <Input label="Period from" type="date" value={form.period_from} onChange={(event) => setForm({ ...form, period_from: event.target.value })} helper="Defaults to the first day of the month" />
        <Input label="Period to" type="date" value={form.period_to} onChange={(event) => setForm({ ...form, period_to: event.target.value })} helper="Defaults to the last day of the month" />
        <Textarea label="Notes" value={form.calculation_notes} onChange={(event) => setForm({ ...form, calculation_notes: event.target.value })} rows={2} className="sm:col-span-2" />
      </div>
      <p className="mt-3 text-[13px] text-ink-muted">
        One run exists per company, unit, department and month. After creating it, calculate the payroll: the engine reads every
        active employee&apos;s live salary structure and the attendance marked for the month.
      </p>
    </Modal>
  );
}
