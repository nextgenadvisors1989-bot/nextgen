'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatNumber, truncate } from '@/lib/utils/formatting';
import { formatDate, daysRemaining } from '@/lib/utils/dates';

export interface EmployerDashboardData {
  stats: {
    totalEmployees: number; activeEmployees: number; totalUnits: number; totalDepartments: number;
    totalAudits: number; openAudits: number; totalDocuments: number;
    expiringDocuments: number; expiredDocuments: number; currentMonthNet: number | string;
  };
  upcomingAudits: {
    id: number; assignment_number: string; audit_title: string; status: string; priority: string;
    start_date: string | null; due_date: string | null; auditor_name: string; progress_percent: number;
  }[];
  expiringDocuments: { id: number; document_name: string; document_type: string; expiry_date: string; compliance_status: string; days_to_expiry: number }[];
  departmentHeadcount: { department_name: string; total: number }[];
}

export function EmployerDashboard({ data, companyName }: { data: EmployerDashboardData; companyName: string }) {
  const { stats } = data;
  const maxHeadcount = Math.max(...data.departmentHeadcount.map((row) => row.total), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{companyName}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {formatNumber(stats.activeEmployees)} active employee(s) across {stats.totalUnits} unit(s) and {stats.totalDepartments} department(s).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/employer/employees/create" className="btn btn-outline">Add Employee</Link>
          <Link href="/employer/payroll/run" className="btn btn-primary">Run Payroll</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={formatNumber(stats.totalEmployees)} hint={`${formatNumber(stats.activeEmployees)} active`} tone="brand" />
        <StatCard label="Open Audits" value={formatNumber(stats.openAudits)} hint={`${stats.totalAudits} total assignments`} tone="amber" />
        <StatCard
          label="Compliance Documents" value={formatNumber(stats.totalDocuments)}
          hint={stats.expiredDocuments > 0 ? `${stats.expiredDocuments} expired` : `${stats.expiringDocuments} expiring soon`}
          tone={stats.expiredDocuments > 0 ? 'red' : 'violet'}
        />
        <StatCard label="Net Pay — This Month" value={formatCurrency(stats.currentMonthNet, { decimals: 0 })} hint="Published payslips" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <CardHeader
            title="Audits in progress"
            description="Scheduled and ongoing audits for your company"
            action={<Link href="/employer/audits" className="text-sm font-medium text-brand-600 hover:underline">All audits</Link>}
          />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-head">Assignment</th>
                  <th className="table-head">Auditor</th>
                  <th className="table-head">Schedule</th>
                  <th className="table-head">Progress</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.upcomingAudits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-cell text-center text-ink-muted">No audits scheduled at the moment.</td>
                  </tr>
                )}
                {data.upcomingAudits.map((audit) => {
                  const remaining = daysRemaining(audit.due_date);
                  return (
                    <tr key={audit.id} className="transition-colors duration-150 hover:bg-surface-muted">
                      <td className="table-cell">
                        <Link href={`/employer/audits/${audit.id}`} className="font-medium text-brand-600 hover:underline">
                          {audit.assignment_number}
                        </Link>
                        <span className="block text-xs text-ink-muted">{truncate(audit.audit_title, 40)}</span>
                      </td>
                      <td className="table-cell text-ink-soft">{truncate(audit.auditor_name, 22)}</td>
                      <td className="table-cell text-ink-soft">
                        {formatDate(audit.start_date)} → {formatDate(audit.due_date)}
                        {remaining !== null && remaining < 0 && <Badge tone="danger" className="ml-2">{Math.abs(remaining)}d late</Badge>}
                      </td>
                      <td className="table-cell min-w-[120px]"><ProgressBar value={Number(audit.progress_percent ?? 0)} height={6} /></td>
                      <td className="table-cell">
                        <StatusBadge status={audit.status} />
                        {audit.priority === 'Urgent' && <PriorityBadge priority="Urgent" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padded={false}>
          <CardHeader
            title="Compliance expiry watch"
            description="Renew before the due date"
            action={<Link href="/employer/compliance-documents" className="text-sm font-medium text-brand-600 hover:underline">Register</Link>}
          />
          <CardBody className="space-y-3">
            {data.expiringDocuments.length === 0 ? (
              <EmptyState title="All documents current" subtitle="Nothing expires in the next 90 days." compact />
            ) : (
              data.expiringDocuments.map((document) => (
                <Link key={document.id} href={`/employer/compliance-documents/${document.id}`}
                  className="block rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-surface-muted">
                  <p className="text-[13px] font-medium text-ink">{truncate(document.document_name, 38)}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs">
                    <StatusBadge status={document.compliance_status} dot={false} />
                    <span className={document.days_to_expiry < 0 ? 'font-medium text-red-600' : 'text-ink-muted'}>
                      {document.days_to_expiry < 0
                        ? `expired ${Math.abs(document.days_to_expiry)} day(s) ago`
                        : `expires in ${document.days_to_expiry} day(s)`}
                    </span>
                  </p>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card padded={false}>
        <CardHeader title="Headcount by department" description="Active employees only" action={<Link href="/employer/departments" className="text-sm font-medium text-brand-600 hover:underline">Manage</Link>} />
        <CardBody className="space-y-3.5">
          {data.departmentHeadcount.length === 0 ? (
            <EmptyState title="No departments yet" subtitle="Create departments to organise your workforce." compact />
          ) : (
            data.departmentHeadcount.map((row) => (
              <div key={row.department_name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink-soft">{row.department_name}</span>
                  <span className="font-medium text-ink">{formatNumber(row.total)}</span>
                </div>
                <ProgressBar value={(row.total / maxHeadcount) * 100} showValue={false} height={6} />
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
