import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { getReportDetail } from '@/services/audit-report.service';
import { formatDate, formatDateTime } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Audit Report' };
export const dynamic = 'force-dynamic';

/**
 * The company's own copy of an audit report: summary, scorecard, findings with the action required, and the
 * verifier's decision. A report filed against another establishment is a 404, exactly like a missing one.
 */
export default async function EmployerAuditReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['employer']);
  const detail = await getReportDetail(id);
  if (!detail || Number(detail.report.employer_id ?? 0) !== Number(user.employerId ?? 0)) notFound();

  const report = detail.report;
  const score = report.score_percentage === null || report.score_percentage === undefined ? null : Number(report.score_percentage);
  const decisions = (detail.decisions ?? []) as unknown as Record<string, unknown>[];
  const decision = decisions[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(report.audit_title)}
        description={`${String(report.report_number)} · version ${String(report.current_version)}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'Audit Reports', href: '/employer/audit-reports' },
          { label: String(report.report_number) },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={String(report.status)} />
          <Badge tone="slate">{String(report.report_type)}</Badge>
          {score !== null && <Badge tone={score >= 90 ? 'success' : score >= 75 ? 'brand' : score >= 60 ? 'warning' : 'danger'}>{score.toFixed(2)}%</Badge>}
        </div>
        <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${report.id}`} target="_blank" rel="noreferrer">Download PDF</a>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card padded={false}>
            <CardHeader title="Executive summary and methodology" />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line text-sm text-ink-soft">{detail.body.executive_summary ?? 'No executive summary was written for this report.'}</p>
              {detail.body.methodology && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-ink">Scope and methodology</h3>
                  <p className="whitespace-pre-line text-sm text-ink-soft">{detail.body.methodology}</p>
                </div>
              )}
              {score !== null && <ProgressBar value={score} height={8} />}
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Scorecard (${detail.body.scorecard.length} section(s))`} />
            <CardBody className="space-y-3">
              {detail.body.scorecard.length === 0 ? (
                <p className="text-sm text-ink-muted">No section-wise scorecard was recorded.</p>
              ) : detail.body.scorecard.map((row, index) => {
                const percentage = Number(row.max_score) > 0 ? (Number(row.obtained_score) / Number(row.max_score)) * 100 : 0;
                return (
                  <div key={index}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-ink-soft">{row.section}</span>
                      <span className="text-ink-muted">{Number(row.obtained_score).toFixed(2)} / {Number(row.max_score).toFixed(2)} · {percentage.toFixed(1)}%</span>
                    </div>
                    <ProgressBar value={percentage} height={6} tone={percentage >= 90 ? 'emerald' : percentage >= 75 ? 'brand' : percentage >= 60 ? 'amber' : 'red'} />
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Findings (${detail.body.findings.length})`} description="Each non-conformity, the clause it breaches and the action your establishment must take" />
            <CardBody>
              {detail.body.findings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">No findings were recorded against this audit.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.body.findings.map((finding, index) => (
                    <li key={index} className="rounded-lg border border-line p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone={finding.severity === 'Critical' ? 'danger' : finding.severity === 'Major' ? 'warning' : finding.severity === 'Minor' ? 'brand' : 'slate'}>{finding.severity}</Badge>
                        {finding.status && <Badge tone={finding.status === 'Closed' ? 'success' : 'warning'}>{finding.status}</Badge>}
                        <span className="ml-auto text-xs text-ink-muted">F-{String(index + 1).padStart(2, '0')}{finding.due_date ? ` · due ${formatDate(finding.due_date)}` : ''}</span>
                      </div>
                      {finding.clause && <p className="text-xs text-ink-muted">{finding.clause}</p>}
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{finding.description}</p>
                      {finding.recommendation && <p className="mt-1 text-xs text-emerald-700"><strong>Action required:</strong> {finding.recommendation}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="Verification" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-ink-soft"><strong>Filed</strong> {report.submitted_at ? formatDateTime(String(report.submitted_at)) : '-'}</p>
              <p className="text-ink-soft"><strong>Auditor</strong> {String(report.auditor_name ?? '-')}</p>
              <p className="text-ink-soft"><strong>Audit</strong> {String(report.assignment_number ?? '-')}</p>
              <p className="text-ink-soft"><strong>Next audit due</strong> {report.next_audit_due ? formatDate(String(report.next_audit_due)) : 'Not scheduled'}</p>
              {decision ? (
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Verifier decision</p>
                  <p className="mt-1 font-medium capitalize text-ink">{String(decision.action ?? decision.decision ?? '').replace(/_/g, ' ')}</p>
                  {decision.comments ? <p className="mt-1 whitespace-pre-line text-xs text-ink-soft">{String(decision.comments)}</p> : null}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">No decision has been recorded yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
