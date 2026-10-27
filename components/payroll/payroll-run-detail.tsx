'use client';

/**
 * Payroll run detail — one run, its payslips, and every action the lifecycle
 * allows at this state.
 *
 * The head-wise totals above the table are what a payroll officer signs off
 * against: gross, each statutory deduction on its own line, and the net that
 * goes to the bank. Each payslip row opens the employee's copy, and the run can
 * be calculated again, approved, locked, paid, published to the employees and
 * turned into a bank file from here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { PayslipDetail } from './payslip-detail';

interface PayslipRow {
  id: number;
  payslip_number: string;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  paid_days: number;
  lop_days: number;
  overtime_hours: number;
  gross_earnings: number;
  pf_employee: number;
  esi_employee: number;
  professional_tax: number;
  lwf_amount: number;
  tds_amount: number;
  total_deductions: number;
  net_pay: number;
  payment_status: string;
  payment_mode: string | null;
  paid_at: string | null;
  is_published: boolean;
  pdf_file_id: number | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
}

interface RunDetail {
  id: number;
  run_number: string;
  employer_id: number;
  company_name: string;
  employer_code: string;
  unit_name: string | null;
  department_name: string | null;
  month: number;
  year: number;
  month_label: string;
  period_from: string | null;
  period_to: string | null;
  status: string;
  calculation_notes: string | null;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_pf_employee: number;
  total_pf_employer: number;
  total_esi_employee: number;
  total_esi_employer: number;
  total_pt: number;
  total_lwf: number;
  total_overtime: number;
  paid_days_total: number;
  processed_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  bank_file_generated_at: string | null;
  payslips: PayslipRow[];
  stats: { total: number; gross: number; net: number; deductions: number; paid: number; pending: number };
}

const STEPPER = ['Draft', 'Calculated', 'Approved', 'Locked', 'Paid'];

export function PayrollRunDetail({
  runId, panel, canUpdate, canPublish, canGenerate,
}: {
  runId: number;
  panel: 'admin' | 'employer';
  canUpdate: boolean;
  canPublish: boolean;
  canGenerate: boolean;
}) {
  const base = panel === 'admin' ? '/api/admin/payroll' : '/api/employer/payroll';
  const { success, error: errorToast } = useToast();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ employee: string; reason: string }[] | null>(null);
  const [openPayslip, setOpenPayslip] = useState<number | null>(null);

  useMemo(() => {
    let alive = true;
    api.get<RunDetail>(`${base}/${runId}`).then((result) => {
      if (alive) setRun((result.data as RunDetail) ?? null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, runId, reload]);

  const act = async (action: 'calculate' | 'publish' | 'generate' | 'status', status?: string) => {
    setBusy(action + (status ?? ''));
    try {
      if (action === 'calculate') {
        const result = await api.post<{ skipped?: { employee: string; reason: string }[] }>(`${base}/${runId}/calculate`);
        success(result.message);
        if (result.data?.skipped?.length) setSkipped(result.data.skipped);
      } else if (action === 'publish') {
        const result = await api.post(`${base}/${runId}/publish`);
        success(result.message);
      } else if (action === 'generate') {
        const result = await api.post(`${base}/${runId}/generate`);
        success(result.message);
      } else {
        const result = await api.post(`${base}/${runId}/status`, { status });
        success(result.message);
      }
      setReload((value) => value + 1);
    } catch (failure) {
      errorToast((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<PayslipRow>[] = [
    {
      key: 'payslip_number',
      header: 'Payslip',
      render: (row) => (
        <button type="button" onClick={() => setOpenPayslip(row.id)} className="text-left font-medium text-ink hover:text-accent">
          {row.payslip_number}
          <div className="text-xs text-ink-muted">{row.employee_number}</div>
        </button>
      ),
    },
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div className="min-w-[160px]">
        <div className="text-ink">{row.employee_name}</div>
        <div className="text-xs text-ink-muted">{row.designation ?? '—'}</div>
      </div>
    ) },
    { key: 'paid_days', header: 'Paid days', align: 'center', render: (row) => `${formatNumber(row.paid_days)}${Number(row.lop_days) ? ` · LOP ${formatNumber(row.lop_days)}` : ''}` },
    { key: 'overtime_hours', header: 'OT hrs', align: 'center', render: (row) => (Number(row.overtime_hours) ? formatNumber(row.overtime_hours) : '—') },
    { key: 'gross_earnings', header: 'Gross', align: 'right', render: (row) => formatCurrency(row.gross_earnings) },
    { key: 'pf_employee', header: 'PF', align: 'right', render: (row) => formatCurrency(row.pf_employee) },
    { key: 'esi_employee', header: 'ESI', align: 'right', render: (row) => formatCurrency(row.esi_employee) },
    { key: 'professional_tax', header: 'PT / LWF', align: 'right', render: (row) => formatCurrency(Number(row.professional_tax) + Number(row.lwf_amount)) },
    { key: 'total_deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.total_deductions) },
    { key: 'net_pay', header: 'Net pay', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.net_pay)}</span> },
    {
      key: 'payment_status',
      header: 'Payment',
      align: 'center',
      render: (row) => (
        <div className="space-y-1">
          <Badge tone={row.payment_status === 'Paid' ? 'success' : row.payment_status === 'Failed' ? 'danger' : row.payment_status === 'On Hold' ? 'warning' : 'default'}>
            {row.payment_status}
          </Badge>
          {row.is_published ? <div className="text-[11px] text-ink-muted">published</div> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 120,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpenPayslip(row.id)}>View</Button>
          {canGenerate ? (
            <a
              href={`${base}/payslips/${row.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              PDF
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  if (!run) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ink-muted">Loading payroll run…</p>
      </Card>
    );
  }

  const currentStep = STEPPER.indexOf(run.status);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">{run.run_number}</h2>
              <Badge tone={run.status === 'Paid' ? 'success' : run.status === 'Cancelled' ? 'danger' : run.status === 'Draft' ? 'default' : 'info'}>{run.status}</Badge>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              {run.company_name} ({run.employer_code})
              {run.unit_name ? ` · ${run.unit_name}` : ''}
              {run.department_name ? ` · ${run.department_name}` : ''} · {run.month_label}{' '}
              · {formatDate(run.period_from)} to {formatDate(run.period_to)}
            </p>
            {run.calculation_notes ? <p className="mt-1 text-[13px] text-ink-muted">Notes: {run.calculation_notes}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canUpdate ? (
              <Button size="sm" variant="secondary" loading={busy === 'calculate'} onClick={() => act('calculate')}>
                {run.payslips.length ? 'Recalculate' : 'Calculate payroll'}
              </Button>
            ) : null}
            {canGenerate ? (
              <Button size="sm" variant="outline" loading={busy === 'generate'} onClick={() => act('generate')}>
                Generate payslip PDFs
              </Button>
            ) : null}
            {canPublish ? (
              <Button size="sm" variant="outline" loading={busy === 'publish'} onClick={() => act('publish')}>
                Publish to employees
              </Button>
            ) : null}
            {canUpdate && run.status === 'Calculated' ? (
              <Button size="sm" loading={busy === 'statusApproved'} onClick={() => act('status', 'Approved')}>Approve</Button>
            ) : null}
            {canUpdate && run.status === 'Approved' ? (
              <Button size="sm" loading={busy === 'statusLocked'} onClick={() => act('status', 'Locked')}>Lock payroll</Button>
            ) : null}
            {canUpdate && run.status === 'Locked' ? (
              <Button size="sm" variant="success" loading={busy === 'statusPaid'} onClick={() => act('status', 'Paid')}>Mark as paid</Button>
            ) : null}
            <a
              href={`/api/pdf/payroll/wage-register/${run.id}${panel === 'admin' ? `?employer_id=${run.employer_id}` : ''}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              Wage register (Rule 11(5))
            </a>
            <a
              href={`${base}/${run.id}/bank-file?format=csv`}
              className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              Bank file
            </a>
          </div>
        </div>

        <ol className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          {STEPPER.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={
                  index <= currentStep && run.status !== 'Cancelled'
                    ? 'rounded-full bg-brand-500 px-2.5 py-1 font-medium text-white'
                    : 'rounded-full bg-surface-muted px-2.5 py-1 text-ink-muted'
                }
              >
                {step}
              </span>
              {index < STEPPER.length - 1 ? <span className="text-ink-muted">→</span> : null}
            </li>
          ))}
        </ol>

        <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-ink-muted">Processed</dt><dd className="text-ink">{formatDateTime(run.processed_at)}</dd></div>
          <div><dt className="text-ink-muted">Approved</dt><dd className="text-ink">{formatDateTime(run.approved_at)}</dd></div>
          <div><dt className="text-ink-muted">Locked</dt><dd className="text-ink">{formatDateTime(run.locked_at)}</dd></div>
          <div><dt className="text-ink-muted">Bank file generated</dt><dd className="text-ink">{formatDateTime(run.bank_file_generated_at)}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees paid" value={formatNumber(run.total_employees)} hint={`${formatNumber(run.paid_days_total)} paid day(s) in total`} />
        <StatCard label="Gross earnings" value={formatCurrency(run.total_gross)} hint={`Overtime ${formatCurrency(run.total_overtime)}`} />
        <StatCard label="Total deductions" value={formatCurrency(run.total_deductions)} hint={`TDS is a provisional recovery`} />
        <StatCard label="Net payable" value={formatCurrency(run.total_net)} hint={`${formatNumber(run.stats.paid)} paid · ${formatNumber(run.stats.pending)} pending`} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Statutory position for the run</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            These are the amounts to be remitted: the employee&apos;s share is deducted from wages, the employer&apos;s share is
            borne over and above them.
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-line p-3">
            <div className="text-[13px] text-ink-muted">Provident fund (EPF)</div>
            <div className="mt-1 text-sm text-ink">Employee {formatCurrency(run.total_pf_employee)}</div>
            <div className="text-sm text-ink">Employer {formatCurrency(run.total_pf_employer)}</div>
            <div className="mt-1 text-[13px] font-medium text-ink">Total {formatCurrency(Number(run.total_pf_employee) + Number(run.total_pf_employer))}</div>
          </div>
          <div className="rounded-lg border border-line p-3">
            <div className="text-[13px] text-ink-muted">ESI</div>
            <div className="mt-1 text-sm text-ink">Employee {formatCurrency(run.total_esi_employee)}</div>
            <div className="text-sm text-ink">Employer {formatCurrency(run.total_esi_employer)}</div>
            <div className="mt-1 text-[13px] font-medium text-ink">Total {formatCurrency(Number(run.total_esi_employee) + Number(run.total_esi_employer))}</div>
          </div>
          <div className="rounded-lg border border-line p-3">
            <div className="text-[13px] text-ink-muted">State levies</div>
            <div className="mt-1 text-sm text-ink">Professional tax {formatCurrency(run.total_pt)}</div>
            <div className="text-sm text-ink">Labour welfare fund {formatCurrency(run.total_lwf)}</div>
            <div className="mt-1 text-[13px] font-medium text-ink">Total {formatCurrency(Number(run.total_pt) + Number(run.total_lwf))}</div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Payslips ({formatNumber(run.payslips.length)})</h2>
          <div className="flex items-center gap-2 text-[13px]">
            <Link href={panel === 'admin' ? '/admin/payroll-register' : '/employer/payroll/payslips'} className="text-accent hover:underline">
              Open the full payslip register
            </Link>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={run.payslips}
          rowKey={(row) => row.id}
          emptyTitle="No payslips in this run yet"
          emptySubtitle="Press Calculate payroll — the engine builds one payslip per eligible employee from their live salary structure, the month's attendance and the statutory rates."
        />
      </Card>

      {openPayslip ? (
        <PayslipDetail payslipId={openPayslip} panel={panel} canGenerate={canGenerate} onClose={() => setOpenPayslip(null)} />
      ) : null}

      {skipped ? (
        <Modal
          open
          onClose={() => setSkipped(null)}
          title="Employees skipped in this calculation"
          description="These employees are on the company's rolls but had nothing to compute from. Fix the cause and calculate again."
          size="lg"
          footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setSkipped(null)}>Close</Button></div>}
        >
          <ul className="space-y-2">
            {skipped.map((entry) => (
              <li key={entry.employee} className="rounded-lg border border-line p-3">
                <div className="text-sm font-medium text-ink">{entry.employee}</div>
                <div className="text-[13px] text-ink-muted">{entry.reason}</div>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </div>
  );
}
