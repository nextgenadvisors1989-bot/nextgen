'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPercent, truncate } from '@/lib/utils/formatting';
import { formatDate, timeAgo, daysRemaining } from '@/lib/utils/dates';

export interface VerifierDashboardData {
  stats: { pending: number; completed: number; approved: number; rejected: number; returned: number };
  queue: {
    assignment_id: number; verification_status: string; assigned_at: string; due_date: string | null;
    report_id: number; report_number: string; audit_title: string; status: string;
    score_percentage: number | string | null; submitted_at: string | null;
    company_name: string; auditor_name: string | null;
  }[];
}

export function VerifierDashboard({ data, userName }: { data: VerifierDashboardData; userName: string }) {
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Verification queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {userName.split(' ')[0]}, {stats.pending} report(s) waiting for your review.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending Review" value={stats.pending} hint="Oldest first" tone={stats.pending ? 'amber' : 'slate'} />
        <StatCard label="Approved" value={stats.approved} hint="All time" tone="emerald" />
        <StatCard label="Returned for Correction" value={stats.returned} hint="Back with the auditor" tone="brand" />
        <StatCard label="Rejected" value={stats.rejected} hint="All time" tone={stats.rejected ? 'red' : 'slate'} />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Reports awaiting verification"
          description="Ordered by submission time — oldest first"
          action={<Link href="/verifier/reports" className="text-sm font-medium text-brand-600 hover:underline">All assignments</Link>}
        />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-head">Report</th>
                <th className="table-head">Employer</th>
                <th className="table-head">Auditor</th>
                <th className="table-head">Submitted</th>
                <th className="table-head">Score</th>
                <th className="table-head">Due</th>
                <th className="table-head table-head-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.queue.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-ink-muted">
                    Nothing to verify right now. Reports submitted by auditors will appear here.
                  </td>
                </tr>
              )}
              {data.queue.map((item) => {
                const remaining = daysRemaining(item.due_date);
                return (
                  <tr key={item.assignment_id} className="transition-colors duration-150 hover:bg-surface-muted">
                    <td className="table-cell">
                      <Link href={`/verifier/reports/${item.report_id}`} className="font-medium text-brand-600 hover:underline">
                        {item.report_number}
                      </Link>
                      <span className="block text-xs text-ink-muted">{truncate(item.audit_title, 40)}</span>
                    </td>
                    <td className="table-cell text-ink-soft">{truncate(item.company_name, 24)}</td>
                    <td className="table-cell text-ink-soft">{truncate(item.auditor_name ?? '—', 20)}</td>
                    <td className="table-cell text-ink-soft">
                      {item.submitted_at ? timeAgo(item.submitted_at) : '—'}
                      <span className="block text-xs text-ink-muted">{formatDate(item.submitted_at)}</span>
                    </td>
                    <td className="table-cell">
                      {item.score_percentage === null ? '—' : <Badge tone="brand">{formatPercent(item.score_percentage, 0)}</Badge>}
                    </td>
                    <td className="table-cell">
                      <span className="text-ink-soft">{formatDate(item.due_date)}</span>
                      {remaining !== null && remaining < 0 && <Badge tone="danger" className="ml-2">{Math.abs(remaining)}d late</Badge>}
                    </td>
                    <td className="table-cell table-cell-actions">
                      <Link href={`/verifier/reports/${item.report_id}/review`} className="btn btn-sm btn-primary">Review</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="How verification works" />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Step number={1} title="Review the submission"
            text="Read the auditor's report, scores, evidence and attached documents. Every submitted version is preserved." />
          <Step number={2} title="Approve, reject or return"
            text="Approve to lock the report and email the employer, reject with a reason, or return it to the auditor for correction." />
          <Step number={3} title="Versions stay traceable"
            text="Each decision is recorded with your comments against the exact report version that was reviewed." />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Completed Verifications" value={stats.completed} hint="Reports you have closed" tone="violet" />
        <StatCard label="Decisions Logged" value={stats.approved + stats.rejected + stats.returned} hint="Approve / reject / return" tone="brand" />
        <StatCard label="Still Open" value={stats.pending} hint="In your queue" tone={stats.pending ? 'amber' : 'slate'} />
      </div>
    </div>
  );
}

function Step({ number, title, text }: { number: number; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{number}</span>
      <p className="mt-2 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{text}</p>
    </div>
  );
}
