'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatDateTime, timeAgo, daysRemaining } from '@/lib/utils/dates';
import { formatPercent, truncate } from '@/lib/utils/formatting';

export interface AuditorDashboardData {
  stats: { openAudits: number; inProgress: number; submitted: number; overdue: number; approved: number; approvedThisMonth: number };
  assignments: {
    id: number; assignment_number: string; audit_title: string; status: string; priority: string;
    start_date: string | null; due_date: string | null; progress_percent: number;
    company_name: string; days_remaining: number | null;
  }[];
  recentReports: {
    id: number; report_number: string; audit_title: string; status: string;
    submitted_at: string | null; score_percentage: number | string | null; company_name: string;
  }[];
  upcomingMeetings: { id: number; title: string; start_datetime: string; location: string | null; event_type: string }[];
  currentMonth: string;
}

export function AuditorDashboard({ data, userName }: { data: AuditorDashboardData; userName: string }) {
  const { stats } = data;
  const completion = stats.openAudits + stats.submitted + stats.approved > 0
    ? (stats.approved / (stats.openAudits + stats.submitted + stats.approved)) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Auditor workspace</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {userName.split(' ')[0]}, you have {stats.openAudits} open assignment(s) — {stats.overdue} overdue.
          </p>
        </div>
        <Link href="/auditor/audits" className="btn btn-primary">My Assignments</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open Audits" value={stats.openAudits} hint={`${stats.inProgress} in progress`} tone="brand" />
        <StatCard label="Submitted" value={stats.submitted} hint="Awaiting verification" tone="amber" />
        <StatCard label="Overdue" value={stats.overdue} hint="Past the due date" tone={stats.overdue ? 'red' : 'slate'} />
        <StatCard label="Approved" value={stats.approved} hint={`${stats.approvedThisMonth} this month`} tone="emerald" />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Prioritised assignment queue"
          description="Ordered by priority, then due date"
          action={<Link href="/auditor/audits" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>}
        />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-head">Assignment</th>
                <th className="table-head">Employer</th>
                <th className="table-head">Due</th>
                <th className="table-head">Progress</th>
                <th className="table-head">Status</th>
                <th className="table-head table-head-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-ink-muted">
                    No open assignments. New audits assigned to you will appear here.
                  </td>
                </tr>
              )}
              {data.assignments.map((assignment) => {
                const remaining = assignment.days_remaining ?? daysRemaining(assignment.due_date);
                const notStarted = assignment.status === 'Not Started';
                return (
                  <tr key={assignment.id} className="transition-colors duration-150 hover:bg-surface-muted">
                    <td className="table-cell">
                      <Link href={`/auditor/audits/${assignment.id}`} className="font-medium text-brand-600 hover:underline">
                        {assignment.assignment_number}
                      </Link>
                      <span className="block text-xs text-ink-muted">{truncate(assignment.audit_title, 46)}</span>
                    </td>
                    <td className="table-cell text-ink-soft">{truncate(assignment.company_name, 26)}</td>
                    <td className="table-cell">
                      <span className="text-ink-soft">{formatDate(assignment.due_date)}</span>
                      {remaining !== null && remaining < 0 && <Badge tone="danger" className="ml-2">{Math.abs(remaining)}d overdue</Badge>}
                      {remaining !== null && remaining >= 0 && remaining <= 3 && <Badge tone="warning" className="ml-2">{remaining}d left</Badge>}
                    </td>
                    <td className="table-cell min-w-[140px]">
                      <ProgressBar value={Number(assignment.progress_percent ?? 0)} height={6} />
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={assignment.status} />
                      {assignment.priority === 'Urgent' && <PriorityBadge priority="Urgent" />}
                    </td>
                    <td className="table-cell table-cell-actions">
                      <Link href={`/auditor/audits/${assignment.id}/${notStarted ? 'start' : 'draft'}`} className="btn btn-sm btn-outline">
                        {notStarted ? 'Start Audit' : 'Resume'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <CardHeader title="Recently submitted reports" action={<Link href="/auditor/reports" className="text-sm font-medium text-brand-600 hover:underline">All reports</Link>} />
          <CardBody className="space-y-3">
            {data.recentReports.length === 0 ? (
              <EmptyState title="No reports submitted yet" subtitle="Submit an audit to generate its report and PDF." compact />
            ) : (
              data.recentReports.map((report) => (
                <Link key={report.id} href="/auditor/reports"
                  className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-surface-muted">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{report.report_number}</span>
                    <span className="block text-xs text-ink-muted">
                      {truncate(report?.audit_title ?? '', 40)} · {truncate(report?.company_name ?? '', 24)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {report.score_percentage !== null && (
                      <span className="text-xs font-medium text-ink-soft">{formatPercent(report.score_percentage, 0)}</span>
                    )}
                    <StatusBadge status={report.status} />
                  </span>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Completion — ${data.currentMonth}`} />
            <CardBody>
              <p className="text-2xl font-semibold text-ink">{formatPercent(completion, 0)}</p>
              <p className="mb-3 text-xs text-ink-muted">of your assigned workload approved</p>
              <ProgressBar value={completion} tone="emerald" />
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title="Upcoming meetings" action={<Link href="/auditor/calendar" className="text-sm font-medium text-brand-600 hover:underline">Calendar</Link>} />
            <CardBody className="space-y-3">
              {data.upcomingMeetings.length === 0 ? (
                <EmptyState title="Nothing scheduled" subtitle="Audit meetings and visits appear here." compact />
              ) : (
                data.upcomingMeetings.map((event) => (
                  <div key={event.id} className="border-l-2 border-brand-400 pl-3">
                    <p className="text-[13px] font-medium text-ink">{truncate(event.title, 40)}</p>
                    <p className="text-xs text-ink-muted">{formatDateTime(event.start_datetime)}</p>
                    {event.location && <p className="text-xs text-ink-muted">{truncate(event.location, 36)}</p>}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Last activity" />
            <CardBody>
              <p className="text-sm text-ink-soft">
                {data.recentReports[0]?.submitted_at
                  ? `Submitted ${data.recentReports[0].report_number} ${timeAgo(data.recentReports[0].submitted_at)}.`
                  : 'No submissions recorded yet.'}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
