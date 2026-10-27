'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatNumber, truncate } from '@/lib/utils/formatting';
import { formatDate, daysRemaining } from '@/lib/utils/dates';

export interface EmployeeDashboardData {
  employee: {
    id: number; name: string; employee_number: string; designation: string | null;
    department: string | null; date_of_joining: string | null; photo: string | null;
    bank_name: string | null; pf_number: string | null; esi_number: string | null; uan: string | null;
  };
  attendance: { present: number; absent: number; leave: number; halfDay: number; od: number; weekOff: number; holiday: number; total: number };
  leaveBalances: { leave_type: string; leave_name: string; opening_balance: string | number; accrued: string | number; availed: string | number; closing_balance: string | number }[];
  latestPayslip: {
    id: number; payslip_number: string; month: number; year: number; net_pay: string | number;
    gross_earnings: string | number; total_deductions: string | number; is_published: number;
    payment_status: string; period_from: string; period_to: string;
  } | null;
  documents: { id: number; document_name: string; document_type: string; expiry_date: string | null; is_verified: number }[];
  checklist: { total: number; submitted: number };
  upcomingHolidays: { holiday_name: string; holiday_date: string; holiday_type: string }[];
}

export function EmployeeDashboard({ data, userName }: { data: EmployeeDashboardData; userName: string }) {
  const { employee, attendance } = data;
  const attendanceRate = attendance.total > 0 ? ((attendance.present + attendance.halfDay * 0.5) / attendance.total) * 100 : 0;
  const checklistPercent = data.checklist.total > 0 ? (data.checklist.submitted / data.checklist.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Hello, {userName.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {employee.employee_number} · {employee.designation ?? 'Employee'}
            {employee.department ? ` · ${employee.department}` : ''} · joined {formatDate(employee.date_of_joining)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/employee/documents" className="btn btn-outline">My Documents</Link>
          <Link href="/employee/payslips" className="btn btn-primary">My Payslips</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present Days (this month)" value={formatNumber(attendance.present)} hint={`${formatNumber(attendance.total)} working days tracked`} tone="emerald" />
        <StatCard label="Leave Taken" value={formatNumber(attendance.leave)} hint={`${formatNumber(attendance.halfDay)} half day(s)`} tone="amber" />
        <StatCard label="Absent" value={formatNumber(attendance.absent)} hint={attendance.absent > 0 ? 'Loss of pay may apply' : 'Clean record'} tone={attendance.absent > 0 ? 'red' : 'slate'} />
        <StatCard
          label="Last Net Pay" value={data.latestPayslip ? formatCurrency(data.latestPayslip.net_pay, { decimals: 0 }) : '—'}
          hint={data.latestPayslip ? data.latestPayslip.payslip_number : 'No payslip published yet'} tone="brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            title="Latest payslip"
            description="Bilingual Tamil/English payslip, downloadable as PDF"
            action={<Link href="/employee/payslips" className="text-sm font-medium text-brand-600 hover:underline">All payslips</Link>}
          />
          <CardBody>
            {!data.latestPayslip ? (
              <EmptyState
                title="No payslip yet"
                subtitle="Your payslip will appear here once payroll for the month is published."
                compact
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Detail label="Payslip No." value={data.latestPayslip.payslip_number} />
                <Detail label="Period" value={`${formatDate(data.latestPayslip.period_from)} → ${formatDate(data.latestPayslip.period_to)}`} />
                <Detail label="Payment status" value={<StatusBadge status={data.latestPayslip.payment_status} />} />
                <Detail label="Gross Earnings" value={formatCurrency(data.latestPayslip.gross_earnings)} />
                <Detail label="Total Deductions" value={formatCurrency(data.latestPayslip.total_deductions)} />
                <Detail label="Net Pay" value={<span className="text-lg font-semibold text-emerald-700">{formatCurrency(data.latestPayslip.net_pay)}</span>} />
                <div className="sm:col-span-3 flex gap-2">
                  <Link href="/employee/payslips" className="btn btn-outline btn-sm">View Payslip</Link>
                  <a href={`/api/employee/payslips/${data.latestPayslip.id}/download`} className="btn btn-primary btn-sm" download>Download PDF</a>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="This month's attendance" />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Attendance rate</span>
                <span className="text-lg font-semibold text-ink">{attendanceRate.toFixed(0)}%</span>
              </div>
              <ProgressBar value={attendanceRate} tone="emerald" />
              <dl className="grid grid-cols-2 gap-2 pt-1 text-sm">
                <Metric label="Present" value={attendance.present} />
                <Metric label="Leave" value={attendance.leave} />
                <Metric label="Half day" value={attendance.halfDay} />
                <Metric label="Absent" value={attendance.absent} />
                <Metric label="On duty" value={attendance.od} />
                <Metric label="Week off" value={attendance.weekOff} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Personal file checklist" action={<Link href="/employee/documents" className="text-sm font-medium text-brand-600 hover:underline">Open</Link>} />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Documents submitted</span>
                <span className="text-sm font-medium text-ink">{data.checklist.submitted} / {data.checklist.total}</span>
              </div>
              <ProgressBar value={checklistPercent} tone={checklistPercent >= 80 ? 'emerald' : 'brand'} />
              <p className="text-xs text-ink-muted">
                Complete your personal file to stay compliant with statutory record-keeping requirements.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <CardHeader title="Leave balance" description="Current financial year" action={<Link href="/employee/leave" className="text-sm font-medium text-brand-600 hover:underline">Apply for leave</Link>} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-head">Leave Type</th>
                  <th className="table-head">Opening</th>
                  <th className="table-head">Accrued</th>
                  <th className="table-head">Availed</th>
                  <th className="table-head">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.leaveBalances.length === 0 && (
                  <tr><td colSpan={5} className="table-cell text-center text-ink-muted">No leave ledger entries yet.</td></tr>
                )}
                {data.leaveBalances.map((row) => (
                  <tr key={row.leave_type} className="transition-colors duration-150 hover:bg-surface-muted">
                    <td className="table-cell font-medium text-ink">{row.leave_name} <span className="text-xs text-ink-muted">({row.leave_type})</span></td>
                    <td className="table-cell text-ink-soft">{Number(row.opening_balance).toFixed(2)}</td>
                    <td className="table-cell text-ink-soft">{Number(row.accrued).toFixed(2)}</td>
                    <td className="table-cell text-ink-soft">{Number(row.availed).toFixed(2)}</td>
                    <td className="table-cell">
                      <Badge tone={Number(row.closing_balance) > 0 ? 'success' : 'slate'}>
                        {Number(row.closing_balance).toFixed(2)} day(s)
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="My documents" action={<Link href="/employee/documents" className="text-sm font-medium text-brand-600 hover:underline">Manage</Link>} />
            <CardBody className="space-y-2.5">
              {data.documents.length === 0 ? (
                <EmptyState title="No documents uploaded" subtitle="Upload your certificates from the documents page." compact />
              ) : (
                data.documents.slice(0, 5).map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{truncate(document.document_name, 32)}</span>
                      <span className="block text-xs text-ink-muted">
                        {document.expiry_date ? `expires ${formatDate(document.expiry_date)}` : document.document_type}
                      </span>
                    </span>
                    <StatusBadge status={document.is_verified ? 'Verified' : 'Pending'} dot={false} />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title="Upcoming holidays" action={<Link href="/employee/calendar" className="text-sm font-medium text-brand-600 hover:underline">Calendar</Link>} />
            <CardBody className="space-y-3">
              {data.upcomingHolidays.length === 0 ? (
                <EmptyState title="No holidays scheduled" compact />
              ) : (
                data.upcomingHolidays.map((holiday) => {
                  const remaining = daysRemaining(holiday.holiday_date);
                  return (
                    <div key={`${holiday.holiday_name}-${holiday.holiday_date}`} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{holiday.holiday_name}</span>
                        <span className="block text-xs text-ink-muted">{formatDate(holiday.holiday_date)} · {holiday.holiday_type}</span>
                      </span>
                      {remaining !== null && <Badge tone={remaining <= 7 ? 'warning' : 'default'}>{remaining}d</Badge>}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded border border-line px-2 py-1.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
