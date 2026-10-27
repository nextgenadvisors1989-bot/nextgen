import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import * as repo from '@/repositories/audit-report.repository';
import { reportStats } from '@/services/audit-report.service';
import { formatDate, formatDateTime, daysRemaining } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'Verification Queue' };
export const dynamic = 'force-dynamic';

/**
 * The verifier's worklist: everything still waiting on a decision, oldest first,
 * because the reports that have been sitting longest are the ones blocking an
 * employer's audit closure.
 */
export default async function VerifierQueuePage() {
  const user = await requirePanel(['verifier', 'admin', 'super_admin']);
  const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));

  const [queue, workload, stats] = await Promise.all([
    isAdmin ? adminQueue() : repo.pendingForVerifier(user.id, 100),
    repo.verifierWorkload(user.id),
    reportStats(),
  ]);

  const overdue = queue.filter((row) => {
    const due = row.verifier_due_date ? daysRemaining(String(row.verifier_due_date)) : null;
    return due !== null && due < 0;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification Queue"
        description={`Reports waiting on ${isAdmin ? 'any verifier' : 'you'} — review the findings, then approve, return for correction or reject.`}
        breadcrumbs={[{ label: 'Dashboard', href: '/verifier/dashboard' }, { label: 'Verification Queue' }]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Awaiting Decision" value={formatNumber(queue.length)} hint={isAdmin ? 'Across all verifiers' : 'In your queue'} tone="violet" />
        <StatCard label="Overdue Reviews" value={formatNumber(overdue.length)} hint="Past the review due date" tone={overdue.length ? 'red' : 'emerald'} />
        <StatCard label="Completed" value={formatNumber(Number(workload?.completed ?? 0))} hint="Decisions you have filed" tone="emerald" />
        <StatCard
          label="Average Turnaround"
          value={workload?.avg_turnaround_days === null || workload?.avg_turnaround_days === undefined ? '—' : `${Number(workload.avg_turnaround_days).toFixed(1)}d`}
          hint="Assignment to decision"
          tone="brand"
        />
        <StatCard label="Returned" value={formatNumber(stats.changesRequested)} hint="Sent back for correction" tone="amber" />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Reports awaiting verification"
          description="Ordered by review due date, then submission time"
          action={<Link className="text-sm font-medium text-brand-600 hover:underline" href="/verifier/dashboard">Back to dashboard</Link>}
        />
        <CardBody className="p-0">
          {queue.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nothing waiting on you"
                subtitle="When an auditor submits a report assigned to you it appears here, with the PDF attached to the notification email."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[13px] font-semibold text-ink-soft">
                  <tr>
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Employer</th>
                    <th className="px-4 py-3">Auditor</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Findings</th>
                    <th className="px-4 py-3">Review Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {queue.map((row) => {
                    const due = row.verifier_due_date ? daysRemaining(String(row.verifier_due_date)) : null;
                    return (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link href={`/verifier/reports/${row.id}`} className="font-medium text-brand-600 hover:underline">
                            {truncate(String(row.audit_title), 40)}
                          </Link>
                          <span className="block text-xs text-ink-muted">
                            {String(row.report_number)} · v{String(row.current_version)}
                            {row.assignment_number ? ` · ${String(row.assignment_number)}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-soft">
                          {truncate(String(row.employer_name ?? '—'), 24)}
                          <span className="block text-xs text-ink-muted">{String(row.unit_name ?? 'All units')}</span>
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{truncate(String(row.auditor_name ?? '—'), 22)}</td>
                        <td className="px-4 py-3 text-xs text-ink-muted">
                          {row.submitted_at ? formatDateTime(String(row.submitted_at)) : '—'}
                          {row.days_in_review !== null && row.days_in_review !== undefined ? (
                            <span className="block">{Number(row.days_in_review)} day(s) in review</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {row.score_percentage === null ? (
                            <span className="text-xs text-ink-muted">Not scored</span>
                          ) : (
                            <span className={`font-semibold ${
                              Number(row.score_percentage) >= 90 ? 'text-emerald-600'
                                : Number(row.score_percentage) >= 75 ? 'text-brand-600'
                                  : Number(row.score_percentage) >= 60 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {Number(row.score_percentage).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Badge tone={Number(row.critical_findings) > 0 ? 'danger' : 'slate'}>{Number(row.critical_findings)} C</Badge>
                            <Badge tone={Number(row.major_findings) > 0 ? 'warning' : 'slate'}>{Number(row.major_findings)} M</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.verifier_due_date ? (
                            <>
                              <span className="block text-ink-soft">{formatDate(String(row.verifier_due_date))}</span>
                              <span className={due !== null && due < 0 ? 'block font-medium text-red-600' : 'block text-ink-muted'}>
                                {due === null ? '' : due < 0 ? `${Math.abs(due)}d overdue` : `in ${due}d`}
                              </span>
                            </>
                          ) : <span className="text-ink-muted">No due date</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/verifier/reports/${row.id}`} className="text-xs font-medium text-brand-600 hover:underline">View</Link>
                            <Link href={`/verifier/reports/${row.id}/review`} className="btn btn-sm btn-primary">Review</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Administrators see the whole pipeline rather than one verifier's slice. */
async function adminQueue() {
  const result = await repo.findReports({
    limit: 100, page: 1, pendingVerification: true, sortBy: 'submitted_at', sortDir: 'asc',
  });
  return result.data;
}
