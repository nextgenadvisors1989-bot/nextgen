'use client';

/**
 * Payslip detail — the full wage statement of one payslip, head by head.
 *
 * This is the screen an employee query is answered on: the attendance the wage
 * was computed from, every earning and deduction with its Tamil name, the
 * employer's own contributions shown separately (they are not deducted), the net
 * pay in figures and words, and the bank particulars. The PDF button renders the
 * same content as the bilingual document the employee receives.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber, maskAccountNumber } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';

interface PayslipItem {
  id: number;
  head_code: string;
  head_name: string;
  head_name_ta: string | null;
  head_type: string;
  amount: number;
  is_statutory: boolean;
}

interface PayslipDetailRow {
  id: number;
  payslip_number: string;
  run_number: string;
  company_name: string;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  employee_department: string | null;
  unit_name: string | null;
  month_label: string;
  period_from: string | null;
  period_to: string | null;
  working_days: number;
  paid_days: number;
  lop_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  weekly_off_days: number;
  overtime_hours: number;
  basic: number;
  da: number;
  hra: number;
  ta: number;
  pa: number;
  ea: number;
  npba: number;
  other_allowances: number;
  overtime_amount: number;
  bonus_amount: number;
  arrears_amount: number;
  gross_earnings: number;
  pf_employee: number;
  pf_employer: number;
  vpf_amount: number;
  esi_employee: number;
  esi_employer: number;
  professional_tax: number;
  lwf_amount: number;
  tds_amount: number;
  advance_deduction: number;
  canteen_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  net_pay_in_words: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  payment_mode: string | null;
  payment_status: string;
  payment_reference: string | null;
  paid_at: string | null;
  is_published: boolean;
  published_at: string | null;
  employee_viewed_at: string | null;
  remarks: string | null;
  items: PayslipItem[];
}

export function PayslipDetail({
  payslipId, panel, canGenerate, onClose,
}: {
  payslipId: number;
  panel: 'admin' | 'employer' | 'employee';
  canGenerate: boolean;
  onClose: () => void;
}) {
  const [slip, setSlip] = useState<PayslipDetailRow | null>(null);

  useMemo(() => {
    let alive = true;
    const endpoint = panel === 'employee' ? `/api/employee/payslips/${payslipId}` : `/api/${panel}/payroll/payslips/${payslipId}`;
    api.get<PayslipDetailRow>(endpoint).then((result) => {
      if (alive) setSlip((result.data as PayslipDetailRow) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [panel, payslipId]);

  const pdfHref = panel === 'employee'
    ? `/api/employee/payslips/${payslipId}/download`
    : `/api/${panel}/payroll/payslips/${payslipId}/pdf`;

  const earnings = slip ? [
    ['Basic Salary', 'அடிப்படை ஊதியம்', slip.basic],
    ['Dearness Allowance', 'அகவிலைப்படி', slip.da],
    ['House Rent Allowance', 'வீட்டு வாடகைப்படி', slip.hra],
    ['Travel Allowance', 'பயணப்படி', slip.ta],
    ['Personal Allowance', null, slip.pa],
    ['Education Allowance', null, slip.ea],
    ['Non-Practising Allowance', null, slip.npba],
    ['Other Allowances', null, slip.other_allowances],
    ['Overtime', 'கூடுதல் நேரம்', slip.overtime_amount],
    ['Bonus', 'போனஸ்', slip.bonus_amount],
    ['Arrears', null, slip.arrears_amount],
  ].filter(([, , amount]) => Number(amount) > 0) as [string, string | null, number][] : [];

  const extraEarnings = (slip?.items ?? []).filter((item) => item.head_type === 'Earning');
  const deductions = slip ? [
    ['Provident Fund (EPF)', 'வருங்கால வைப்பு நிதி', slip.pf_employee],
    ['Voluntary PF', null, slip.vpf_amount],
    ['ESI Contribution', 'ஈ.எஸ்.ஐ பங்களிப்பு', slip.esi_employee],
    ['Professional Tax', 'தொழில் வரி', slip.professional_tax],
    ['Labour Welfare Fund', 'தொழிலாளர் நல நிதி', slip.lwf_amount],
    ['TDS / Income Tax (provisional)', null, slip.tds_amount],
    ['Salary advance', 'முன்பணம்', slip.advance_deduction],
    ['Canteen', null, slip.canteen_deduction],
    ['Other deductions', null, slip.other_deductions],
  ].filter(([, , amount]) => Number(amount) > 0) as [string, string | null, number][] : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={slip ? `Payslip ${slip.payslip_number}` : 'Payslip'}
      description={slip ? `${slip.employee_name} (${slip.employee_number}) · ${slip.month_label} · ${slip.company_name}` : undefined}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] text-ink-muted">
            {slip?.is_published
              ? `Published ${formatDate(slip.published_at)}${slip.employee_viewed_at ? ` · first opened ${formatDate(slip.employee_viewed_at)}` : ' · not opened yet'}`
              : 'Not published to the employee yet'}
          </div>
          <div className="flex items-center gap-2">
            {(canGenerate || panel === 'employee') ? (
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
              >
                {panel === 'employee' ? 'Download payslip' : 'Service card PDF'}
              </a>
            ) : null}
            {(canGenerate || panel === 'employee') ? (
              <a
                href={`${pdfHref}?format=standard`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink-soft hover:bg-surface-muted"
              >
                Detailed payslip
              </a>
            ) : null}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      {!slip ? (
        <p className="text-sm text-ink-muted">Loading payslip…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border border-line p-3 text-[13px] sm:grid-cols-3">
            <div><dt className="text-ink-muted">Run</dt><dd className="text-ink">{slip.run_number}</dd></div>
            <div><dt className="text-ink-muted">Unit</dt><dd className="text-ink">{slip.unit_name ?? '—'}</dd></div>
            <div><dt className="text-ink-muted">Department</dt><dd className="text-ink">{slip.employee_department ?? '—'}</dd></div>
            <div><dt className="text-ink-muted">Wage period</dt><dd className="text-ink">{formatDate(slip.period_from)} to {formatDate(slip.period_to)}</dd></div>
            <div><dt className="text-ink-muted">Bank</dt><dd className="text-ink">{slip.bank_name ?? '—'} · {maskAccountNumber(slip.bank_account_number)}</dd></div>
            <div><dt className="text-ink-muted">IFSC</dt><dd className="text-ink">{slip.ifsc_code ?? '—'}</dd></div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3 text-[13px] sm:grid-cols-4 lg:grid-cols-5">
            {[
              ['Working days', slip.working_days],
              ['Paid days', slip.paid_days],
              ['Present', slip.present_days],
              ['Leave', slip.leave_days],
              ['Holiday', slip.holiday_days],
              ['Weekly off', slip.weekly_off_days],
              ['Absent', slip.absent_days],
              ['Loss of pay', slip.lop_days],
              ['Overtime hours', slip.overtime_hours],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="text-ink-muted">{label}</div>
                <div className="text-ink">{formatNumber(value)}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line">
              <div className="border-b border-line bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">Earnings · வரவுகள்</div>
              <ul className="divide-y divide-line">
                {[...earnings, ...extraEarnings.map((item) => [item.head_name, item.head_name_ta, item.amount] as [string, string | null, number])].map(([name, nameTa, amount]) => (
                  <li key={`${name}-${amount}`} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div>
                      <div className="text-[13px] text-ink">{name}</div>
                      {nameTa ? <div className="text-xs text-ink-muted">{nameTa}</div> : null}
                    </div>
                    <div className="text-[13px] text-ink">{formatCurrency(amount)}</div>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">
                  <span>Gross earnings · மொத்த ஊதியம்</span>
                  <span>{formatCurrency(slip.gross_earnings)}</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-line">
              <div className="border-b border-line bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">Deductions · பிடித்தங்கள்</div>
              <ul className="divide-y divide-line">
                {deductions.map(([name, nameTa, amount]) => (
                  <li key={`${name}-${amount}`} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div>
                      <div className="text-[13px] text-ink">{name}</div>
                      {nameTa ? <div className="text-xs text-ink-muted">{nameTa}</div> : null}
                    </div>
                    <div className="text-[13px] text-ink">{formatCurrency(amount)}</div>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-surface-muted px-3 py-2 text-[13px] font-semibold text-ink">
                  <span>Total deductions · மொத்த பிடித்தம்</span>
                  <span>{formatCurrency(slip.total_deductions)}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-accent/30 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-ink">NET PAY · நிகர ஊதியம்</div>
                <div className="text-xs text-ink-muted">{slip.net_pay_in_words ?? ''}</div>
              </div>
              <div className="text-2xl font-semibold text-ink">{formatCurrency(slip.net_pay)}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
              <Badge tone={slip.payment_status === 'Paid' ? 'success' : slip.payment_status === 'Failed' ? 'danger' : 'default'}>{slip.payment_status}</Badge>
              <span>{slip.payment_mode ?? 'Bank Transfer'}</span>
              {slip.payment_reference ? <span>Ref {slip.payment_reference}</span> : null}
              {slip.paid_at ? <span>Paid {formatDate(slip.paid_at)}</span> : null}
            </div>
          </div>

          <div className="rounded-lg border border-line p-3">
            <div className="text-[13px] font-semibold text-ink">Employer&apos;s contribution (not deducted from wages)</div>
            <div className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
              <div className="flex items-center justify-between"><span className="text-ink-muted">Provident fund — employer</span><span className="text-ink">{formatCurrency(slip.pf_employer)}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-muted">ESI — employer</span><span className="text-ink">{formatCurrency(slip.esi_employer)}</span></div>
            </div>
          </div>

          {slip.remarks ? <p className="text-[13px] text-ink-muted">Remarks: {slip.remarks}</p> : null}
        </div>
      )}
    </Modal>
  );
}
