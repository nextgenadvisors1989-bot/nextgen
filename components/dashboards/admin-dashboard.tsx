'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatNumber, truncate } from '@/lib/utils/formatting';
import { formatDate, timeAgo, daysRemaining } from '@/lib/utils/dates';
import { AUDIT_STATUS_COLORS } from '@/types/audit';

export interface AdminDashboardData {
  stats: {
    totalEmployers: number;
    activeEmployers: number;
    totalAuditors: number;
    totalEmployees: number;
    activeAudits: number;
    overdueAudits: number;
    pendingVerification: number;
    approvedThisMonth: number;
    expiringDocuments: number;
    payrollRunsThisMonth: number;
    payrollNetTotal: number | string;
  };
  auditStatusBreakdown: { status: string; total: number }[];
  recentAssignments: {
    id: number; assignment_number: string; audit_title: string; company_name: string;
    auditor_name: string; status: string; priority: string; due_date: string | null; progress_percent: number;
  }[];
  recentActivity: { id: number; description: string | null; user_name: string | null; module: string; created_at: string }[];
  complianceAlerts: {
    id: number; document_name: string; company_name: string; expiry_date: string; days_to_expiry: number;
    compliance_status: string;
  }[];
  topAuditors: { id: number; name: string; completed: number; pending: number; overdue: number }[];
}

export function AdminDashboard({ data, userName }: { data: AdminDashboardData; userName: string }) {
  const { stats } = data;
  const maxStatus = Math.max(...data.auditStatusBreakdown.map((row) => row.total), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome back, {userName.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Platform overview as of {formatDate(new Date())} — {stats.activeEmployers} active employer(s),
          {' '}{stats.totalAuditors} auditor(s) and {formatNumber(stats.totalEmployees)} employee records.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Employers" value={formatNumber(stats.totalEmployers)}
          hint={`${stats.activeEmployers} active`} tone="brand"
          icon={<Icon path="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M15 21V9h3a2 2 0 0 1 2 2v10" />}
        />
        <StatCard
          label="Employees" value={formatNumber(stats.totalEmployees)}
          hint="Across all employers" tone="emerald"
          icon={<Icon path="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />}
        />
        <StatCard
          label="Active Audits" value={formatNumber(stats.activeAudits)}
          hint={`${stats.overdueAudits} overdue`} tone={stats.overdueAudits > 0 ? 'red' : 'amber'}
          icon={<Icon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />}
        />
        <StatCard
          label="Pending Verification" value={formatNumber(stats.pendingVerification)}
          hint={`${stats.approvedThisMonth} approved this month`} tone="violet"
          icon={<Icon path="M9 12l2 2 4-4m5.6-4A11.9 11.9 0 0 1 12 2.9 11.9 11.9 0 0 1 3.4 6 12 12 0 0 0 3 9c0 5.6 3.8 10.3 9 11.6C17.2 19.3 21 14.6 21 9c0-1-.1-2.1-.4-3Z" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Documents Expiring (90 days)" value={formatNumber(stats.expiringDocuments)}
          hint="Open the legal register to renew" tone={stats.expiringDocuments > 0 ? 'amber' : 'slate'}
          icon={<Icon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />}
        />
        <StatCard
          label="Payroll Runs This Month" value={formatNumber(stats.payrollRunsThisMonth)}
          hint="Across all employers" tone="brand"
          icon={<Icon path="M6 3h12M6 8h12M6 13h4a5 5 0 0 0 0-10M6 13l8 8" />}
        />
        <StatCard
          label="Net Payroll Disbursed" value={formatCurrency(stats.payrollNetTotal, { decimals: 0 })}
          hint="Current financial year" tone="emerald"
          icon={<Icon path="M3 3v18h18M7 15v3M12 10v8M17 6v12" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <CardHeader
            title="Audit status breakdown"
            description="Every assignment by current status"
            action={<Link href="/admin/audit-assignments" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>}
          />
          <CardBody className="space-y-3.5">
            {data.auditStatusBreakdown.length === 0 ? (
              <EmptyState
                title="No audits yet"
                subtitle="Create an audit assignment to see the status breakdown here."
                compact
              />
            ) : (
              data.auditStatusBreakdown.map((row) => (
                <div key={row.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-soft">
                      <span className="h-2 w-2 rounded-full" style={{ background: AUDIT_STATUS_COLORS[row.status]?.dot ?? '#94a3b8' }} />
                      {row.status}
                    </span>
                    <span className="font-medium text-ink">{row.total}</span>
                  </div>
                  <ProgressBar value={(row.total / maxStatus) * 100} showValue={false} height={6}
                    tone={row.status === 'Overdue' ? 'red' : row.status === 'Approved' ? 'emerald' : 'brand'} />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card padded={false}>
          <CardHeader title="Top performing auditors" description="By completed audits" />
          <CardBody className="space-y-4">
            {data.topAuditors.length === 0 ? (
              <EmptyState title="No auditors yet" subtitle="Onboard auditors to track performance." compact />
            ) : (
              data.topAuditors.map((auditor, index) => (
                <div key={auditor.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/auditors/${auditor.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-600">
                      {auditor.name}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {auditor.completed} completed · {auditor.pending} pending
                      {auditor.overdue > 0 && <span className="text-red-600"> · {auditor.overdue} overdue</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <CardHeader
            title="Recent audit assignments"
            description="Latest activity across all employers"
            action={<Link href="/admin/audit-assignments" className="text-sm font-medium text-brand-600 hover:underline">Manage</Link>}
          />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="table-head">Assignment</th>
                  <th className="table-head">Employer</th>
                  <th className="table-head">Auditor</th>
                  <th className="table-head">Due</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAssignments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-cell text-center text-ink-muted">
                      No audit assignments yet. <Link href="/admin/audit-assignments/create" className="link">Create the first one</Link>.
                    </td>
                  </tr>
                )}
                {data.recentAssignments.map((assignment) => {
                  const remaining = daysRemaining(assignment.due_date);
                  return (
                    <tr key={assignment.id} className="transition-colors duration-150 hover:bg-surface-muted">
                      <td className="table-cell">
                        <Link href={`/admin/audit-assignments/${assignment.id}`} className="font-medium text-brand-600 hover:underline">
                          {assignment.assignment_number}
                        </Link>
                        <span className="block text-xs text-ink-muted">{truncate(assignment.audit_title, 44)}</span>
                      </td>
                      <td className="table-cell text-ink-soft">{truncate(assignment.company_name, 26)}</td>
                      <td className="table-cell text-ink-soft">{truncate(assignment.auditor_name, 22)}</td>
                      <td className="table-cell">
                        <span className="text-ink-soft">{formatDate(assignment.due_date)}</span>
                        {remaining !== null && remaining < 0 && <Badge tone="danger" className="ml-2">{Math.abs(remaining)}d late</Badge>}
                        {remaining !== null && remaining >= 0 && remaining <= 3 && <Badge tone="warning" className="ml-2">{remaining}d left</Badge>}
                      </td>
                      <td className="table-cell">
                        <StatusBadge status={assignment.status} />
                        {assignment.priority === 'Urgent' && <PriorityBadge priority="Urgent" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="Compliance alerts" description="Expiring within 90 days" />
            <CardBody className="space-y-3">
              {data.complianceAlerts.length === 0 ? (
                <EmptyState title="Nothing expiring" subtitle="All compliance documents are current." compact />
              ) : (
                data.complianceAlerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/admin/compliance/documents/${alert.id}`}
                    className="block rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <p className="text-[13px] font-medium text-ink">{truncate(alert.document_name, 42)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{truncate(alert.company_name, 32)}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs">
                      <StatusBadge status={alert.compliance_status} dot={false} />
                      <span className="text-ink-muted">expires {formatDate(alert.expiry_date)}</span>
                    </p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title="Recent activity" action={<Link href="/admin/activity-logs" className="text-sm font-medium text-brand-600 hover:underline">All logs</Link>} />
            <CardBody>
              <ol className="space-y-3">
                {data.recentActivity.length === 0 && <li className="text-sm text-ink-muted">No activity recorded yet.</li>}
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-ink">{entry.description ?? entry.module}</span>
                      <span className="block text-xs text-ink-muted">
                        {entry.user_name ?? 'System'} · {timeAgo(entry.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}
