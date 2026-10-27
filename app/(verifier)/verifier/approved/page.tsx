import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { verifierDecisionList, verifierWorkload } from '@/repositories/audit-report.repository';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'Approved Reports' };
export const dynamic = 'force-dynamic';

interface DecisionRow {
  id: number;
  report_number: string;
  audit_title: string;
  employer_name?: string | null;
  auditor_name?: string | null;
  report_type: string | null;
  status: string;
  score_percentage: number | null;
  decision_at: string | null;
  decision_comments: string | null;
  decision_reason: string | null;
}

/**
 * Reports you have approved, newest first — what you signed off on, with the note you left.
 *
 * Scoped to the signed-in verifier's own decisions: the repository query joins the
 * latest comment this verifier left, so no query string can show another
 * verifier's work.
 */
export default async function VerifierDecisionPage() {
  const user = await requirePanel(['verifier', 'admin', 'super_admin']);

  const [rows, workload] = await Promise.all([
    verifierDecisionList(user.id, 'approved'),
    verifierWorkload(user.id),
  ]);

  const data = rows as unknown as DecisionRow[];
  const averageScore = data.filter((row) => row.score_percentage !== null).length
    ? data.reduce((total, row) => total + Number(row.score_percentage ?? 0), 0) /
      data.filter((row) => row.score_percentage !== null).length
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title='Approved Reports'
        description='Reports you have approved, newest first — what you signed off on, with the note you left.'
        breadcrumbs={[
          { label: 'Dashboard', href: '/verifier/dashboard' },
          { label: 'Assigned Reports', href: '/verifier/reports' },
          { label: 'Approved Reports' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label='Approved by you' value={formatNumber(data.length)} tone="emerald" />
        <StatCard
          label="Still open to you"
          value={formatNumber(Number(workload?.pending ?? 0))}
          tone={Number(workload?.pending ?? 0) ? 'amber' : 'slate'}
        />
        <StatCard
          label="Average score of these"
          value={averageScore === null ? '—' : `${formatNumber(averageScore, 1)}%`}
          tone="slate"
        />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Your decisions"
            description={data.length > 0
              ? `Oldest on record: ${formatDate(data[data.length - 1]?.decision_at)}`
              : 'Nothing yet.'}
            action={<LinkButton href="/verifier/reports" variant="outline" size="sm">Back to the queue</LinkButton>}
          />
        </div>
        {data.length === 0 ? (
          <EmptyState
            title="No decisions here yet"
            subtitle="Reports you decide on appear here with the note you left."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Report', 'Employer', 'Auditor', 'Score', 'Report status', 'Decided', 'Your note'].map((header, index) => (
                    <th
                      key={header}
                      className={`whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted ${index === 3 ? 'text-right' : ''}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-muted/60">
                    <td className="px-6 py-3">
                      <Link href={`/verifier/reports/${row.id}`} className="font-medium text-brand-600 hover:underline">
                        {truncate(row.audit_title, 44)}
                      </Link>
                      <span className="block text-xs text-ink-muted">{row.report_number}{row.report_type ? ` · ${row.report_type}` : ''}</span>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{row.employer_name ?? '—'}</td>
                    <td className="px-6 py-3 text-ink-soft">{row.auditor_name ?? '—'}</td>
                    <td className="px-6 py-3 text-right text-ink-soft">
                      {row.score_percentage === null || row.score_percentage === undefined
                        ? '—'
                        : `${formatNumber(Math.round(Number(row.score_percentage)))}%`}
                    </td>
                    <td className="px-6 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-6 py-3 text-ink-muted">{row.decision_at ? formatDateTime(row.decision_at) : '—'}</td>
                    <td className="px-6 py-3 text-xs text-ink-soft">{truncate(row.decision_comments || row.decision_reason || '—', 70)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
