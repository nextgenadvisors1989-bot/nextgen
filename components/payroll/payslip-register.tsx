'use client';

/**
 * Payslip register — every payslip, and the payment run that settles them.
 *
 * The screen answers the two questions the payroll office asks after a run:
 * "what did we pay, and has the bank been told yet?" Payment status, mode and
 * reference are set in bulk from here (so a salary upload is marked in one
 * action), the pay register exports as CSV for the bank or an inspector, and each
 * payslip's bilingual PDF opens in place.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate, MONTH_NAMES } from '@/lib/utils/dates';
import { PAYMENT_STATUSES, PAYMENT_MODES } from '@/lib/validations/payroll.validation';
import { PayslipDetail } from './payslip-detail';

interface PayslipRow {
  id: number;
  payslip_number: string;
  run_number: string;
  month: number;
  year: number;
  month_label: string;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  company_name: string;
  net_pay: number;
  gross_earnings: number;
  total_deductions: number;
  paid_days: number;
  payment_status: string;
  payment_mode: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  is_published: boolean;
  pdf_file_id: number | null;
}

export function PayslipRegister({
  panel, canUpdate, canGenerate,
}: {
  panel: 'admin' | 'employer';
  canUpdate: boolean;
  canGenerate: boolean;
}) {
  const base = panel === 'admin' ? '/api/admin/payroll' : '/api/employer/payroll';
  const { success, error: errorToast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [payment, setPayment] = useState({ payment_status: 'Paid', payment_mode: 'Bank Transfer', payment_reference: '', paid_at: new Date().toISOString().slice(0, 10) });

  const list = useList<PayslipRow>({
    endpoint: `${base}/payslips`,
    initialFilters: { search: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), payment_status: 'all', published: 'all' },
    initialLimit: 10,
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const allSelected = list.data.length > 0 && list.data.every((row) => selected.includes(row.id));

  const mark = async () => {
    if (!selected.length) {
      errorToast('Select at least one payslip first');
      return;
    }
    try {
      const result = await api.patch(`${base}/payslips/payments`, {
        ids: selected,
        payment_status: payment.payment_status,
        payment_mode: payment.payment_mode,
        payment_reference: payment.payment_reference || undefined,
        paid_at: payment.payment_status === 'Paid' ? payment.paid_at : undefined,
      });
      success(result.message);
      setSelected([]);
      setPaying(false);
      list.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const columns: Column<PayslipRow>[] = [
    {
      key: 'select',
      header: canUpdate ? (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => setSelected(allSelected ? [] : list.data.map((row) => row.id))}
          aria-label="Select every payslip on this page"
        />
      ) : '',
      width: 44,
      align: 'center',
      render: (row) => (canUpdate ? (
        <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.payslip_number}`} />
      ) : null),
    },
    {
      key: 'payslip_number',
      header: 'Payslip',
      render: (row) => (
        <button type="button" onClick={() => setViewing(row.id)} className="text-left font-medium text-ink hover:text-accent">
          {row.payslip_number}
          <div className="text-xs text-ink-muted">{row.run_number} · {row.month_label}</div>
        </button>
      ),
    },
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
    ...(panel === 'admin' ? [{ key: 'company_name', header: 'Company', render: (row: PayslipRow) => <span className="text-ink-muted">{row.company_name}</span> }] : []),
    { key: 'paid_days', header: 'Paid days', align: 'center', render: (row) => formatNumber(row.paid_days) },
    { key: 'gross_earnings', header: 'Gross', align: 'right', render: (row) => formatCurrency(row.gross_earnings) },
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
          <div className="text-[11px] text-ink-muted">
            {row.paid_at ? formatDate(row.paid_at) : row.payment_mode ?? '—'}
            {row.is_published ? ' · published' : ''}
          </div>
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
          <Button size="sm" variant="ghost" onClick={() => setViewing(row.id)}>View</Button>
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

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Payslip register</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {selected.length ? `${selected.length} payslip(s) selected` : 'Tick the payslips the bank has settled to mark them in one action.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`${base}/register?download=csv&${new URLSearchParams({ ...list.filters, limit: '1000' }).toString()}`, '_blank')}
            >
              Pay register CSV
            </Button>
            {canUpdate ? (
              <Button size="sm" disabled={!selected.length} onClick={() => setPaying(true)}>Mark payment</Button>
            ) : null}
          </div>
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search payslip, employee or code' },
            { key: 'payment_status', type: 'select', label: 'Every payment status', options: PAYMENT_STATUSES.map((value) => ({ value, label: value })) },
            { key: 'published', type: 'select', label: 'Published or not', options: [{ value: 'yes', label: 'Published' }, { value: 'no', label: 'Not published' }] },
            { key: 'month', type: 'select', label: 'Every month', options: MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })) },
            { key: 'year', type: 'select', label: 'Every year', options: [0, 1, 2].map((offset) => new Date().getFullYear() - offset).map((value) => ({ value: String(value), label: String(value) })) },
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
          serialNumber={false}
          emptyTitle="No payslips for these filters"
          emptySubtitle="Calculate a payroll run and its payslips appear here, ready to be published and marked paid."
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {paying ? (
        <Modal
          open
          onClose={() => setPaying(false)}
          title={`Mark ${selected.length} payslip(s)`}
          description="The mode and reference are stored against each payslip, so the bank instruction and the payroll record agree."
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button>
              <Button onClick={mark}>Save payment</Button>
            </div>
          }
        >
          <div className="grid gap-4">
            <Select
              label="Payment status"
              value={payment.payment_status}
              onChange={(value) => setPayment({ ...payment, payment_status: value })}
              options={PAYMENT_STATUSES.map((value) => ({ value, label: value }))}
            />
            <Select
              label="Payment mode"
              value={payment.payment_mode}
              onChange={(value) => setPayment({ ...payment, payment_mode: value })}
              options={PAYMENT_MODES.map((value) => ({ value, label: value }))}
            />
            <Input
              label="Bank / UTR reference"
              value={payment.payment_reference}
              onChange={(event) => setPayment({ ...payment, payment_reference: event.target.value })}
              helper="Optional, but the reference is what reconciles a disputed credit"
            />
            {payment.payment_status === 'Paid' ? (
              <Input label="Paid on" type="date" value={payment.paid_at} onChange={(event) => setPayment({ ...payment, paid_at: event.target.value })} />
            ) : null}
          </div>
        </Modal>
      ) : null}

      {viewing ? <PayslipDetail payslipId={viewing} panel={panel} canGenerate={canGenerate} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
