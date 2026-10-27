import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { getReportDetail } from '@/services/audit-report.service';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ reportId: string }> }): Promise<Metadata> {
  const { reportId } = await params;
  const detail = await getReportDetail(Number(reportId));
  return { title: detail ? `Review ${String(detail.report.report_number)}` : 'Report Review' };
}

/**
 * Read-only review screen for the verifier: the complete report, the version
 * history and the conversation, with the decision screen one click away.
 */
export default async function VerifierReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const user = await requirePanel(['verifier', 'admin', 'super_admin']);

  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));
  if (!isAdmin) {
    const assigned = await queryOne<RowDataPacket>(
      'SELECT id FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1',
      [id, user.id]
    );
    if (!assigned) notFound();
  }

  const detail = await getReportDetail(id);
  if (!detail) notFound();

  const report = detail.report;
  const score = report.score_percentage === null ? null : Number(report.score_percentage);
  const closed = ['Approved', 'Rejected'].includes(String(report.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(report.audit_title)}
        description={`${String(report.report_number)} · version ${String(report.current_version)} · ${String(report.employer_name ?? '')}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/verifier/dashboard' },
          { label: 'Verification Queue', href: '/verifier/reports' },
          { label: String(report.report_number) },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={String(report.status)} />
          <Badge tone="slate">{String(report.report_type)}</Badge>
          <Badge tone="brand">v{String(report.current_version)}</Badge>
          {score !== null && <Badge tone={score >= 90 ? 'success' : score >= 75 ? 'brand' : score >= 60 ? 'warning' : 'danger'}>{score.toFixed(2)}%</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <a className="btn btn-outline btn-sm" href={`/api/pdf/audit-report/${report.id}`} target="_blank" rel="noreferrer">Download PDF</a>
          {!closed && <Link className="btn btn-primary btn-sm" href={`/verifier/reports/${report.id}/review`}>Review &amp; Decide</Link>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card padded={false}>
            <CardHeader title="Executive summary & methodology" />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line text-sm text-ink-soft">
                {detail.body.executive_summary ?? 'No executive summary was written for this report.'}
              </p>
              {detail.body.methodology && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-ink">Scope &amp; methodology</h3>
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
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-soft">{row.section}</span>
                      <span className="text-ink-muted">{Number(row.obtained_score).toFixed(2)} / {Number(row.max_score).toFixed(2)} · {percentage.toFixed(1)}%</span>
                    </div>
                    <ProgressBar value={percentage} height={6}
                      tone={percentage >= 90 ? 'emerald' : percentage >= 75 ? 'brand' : percentage >= 60 ? 'amber' : 'red'} />
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Findings (${detail.body.findings.length})`} description="Every non-conformity with its clause, evidence and the action required" />
            <CardBody>
              {detail.body.findings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
                  No findings were recorded against this audit.
                </p>
              ) : (
                <ul className="space-y-3">
                  {detail.body.findings.map((finding, index) => (
                    <li key={index} className="rounded-lg border border-line p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone={finding.severity === 'Critical' ? 'danger' : finding.severity === 'Major' ? 'warning' : finding.severity === 'Minor' ? 'brand' : 'slate'}>
                          {finding.severity}
                        </Badge>
                        {finding.reference && <Badge tone="slate">{finding.reference}</Badge>}
                        {finding.status && <Badge tone={finding.status === 'Closed' ? 'success' : 'warning'}>{finding.status}</Badge>}
                        <span className="ml-auto text-xs text-ink-muted">
                          F-{String(index + 1).padStart(2, '0')}{finding.due_date ? ` · due ${formatDate(finding.due_date)}` : ''}
                        </span>
                      </div>
                      {finding.clause && <p className="text-xs text-ink-muted">{finding.clause}</p>}
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{finding.description}</p>
                      {finding.evidence && <p className="mt-1 text-xs text-ink-muted"><strong>Evidence:</strong> {finding.evidence}</p>}
                      {finding.recommendation && <p className="mt-1 text-xs text-emerald-700"><strong>Action:</strong> {finding.recommendation}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {(detail.body.observations.length > 0 || detail.body.recommendations.length > 0 || detail.body.regulatory_references.length > 0) && (
            <Card padded={false}>
              <CardHeader title="Observations, recommendations & references" />
              <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Bullets title="Observations" items={detail.body.observations} />
                <Bullets title="Recommendations" items={detail.body.recommendations} />
                <Bullets title="Regulatory references" items={detail.body.regulatory_references} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card padded={false}>
            <CardHeader title="Verification trail" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-ink-soft">
                <strong>Submitted</strong> {report.submitted_at ? formatDateTime(String(report.submitted_at)) : '—'}
              </p>
              <p className="text-ink-soft">
                <strong>Auditor</strong> {String(report.auditor_name ?? '—')}
                {report.auditor_code ? ` (${String(report.auditor_code)})` : ''}
              </p>
              <p className="text-ink-soft"><strong>Assignment</strong> {String(report.assignment_number ?? '—')}</p>
              <p className="text-ink-soft"><strong>Versions filed</strong> {formatNumber(detail.versions.length)}</p>
              <p className="text-ink-soft">
                <strong>Open corrections</strong> {formatNumber(detail.commentCounts.openCorrections)}
              </p>
              <p className="text-ink-soft"><strong>Next audit due</strong> {report.next_audit_due ? formatDate(String(report.next_audit_due)) : 'Not scheduled'}</p>
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Version history (${detail.versions.length})`} />
            <CardBody>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {detail.versions.map((version) => (
                  <li key={version.id} className="flex items-center gap-3 px-3 py-2">
                    <Badge tone={Number(version.version) === Number(report.current_version) ? 'brand' : 'slate'}>v{version.version}</Badge>
                    <span className="min-w-0 flex-1 text-xs text-ink-soft">{version.change_summary ?? '—'}</span>
                    <span className="text-xs text-ink-muted">{version.created_by_name ?? '—'}</span>
                    {version.pdf_file_id && (
                      <a className="text-xs text-brand-600 hover:underline" href={`/api/files/${version.pdf_file_id}/download`} target="_blank" rel="noreferrer">PDF</a>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title={`Conversation (${detail.comments.length})`} />
            <CardBody>
              {detail.comments.length === 0 ? (
                <p className="text-sm text-ink-muted">No comments have been exchanged on this report.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg border border-line p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="font-medium text-ink">{comment.author_name ?? 'Unknown'}</span>
                        <Badge tone={comment.comment_type === 'correction_request' ? 'warning' : 'slate'}>
                          {String(comment.comment_type).replace(/_/g, ' ')}
                        </Badge>
                        {Number(comment.is_resolved) === 1 && <Badge tone="success">resolved</Badge>}
                        <span className="ml-auto text-ink-muted">{formatDateTime(String(comment.created_at))}</span>
                      </div>
                      <p className="whitespace-pre-line text-xs text-ink-soft">{String(comment.comment)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
      <ul className="list-disc space-y-1 rounded-lg border border-line bg-slate-50 p-3 pl-8 text-sm text-ink-soft">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}
