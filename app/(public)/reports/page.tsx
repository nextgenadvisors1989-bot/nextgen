import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublishedAuditOutcomes, listPublishedCmsPages } from '@/services/public.service';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, formatPercent } from '@/lib/utils/formatting';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Aggregated audit outcomes and published compliance reports.',
};

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const [outcomes, publishedReports] = await Promise.all([
    getPublishedAuditOutcomes(),
    listPublishedCmsPages('report'),
  ]);

  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Reports</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            Transparency on the audits we run: how many have been completed, the average compliance score and the
            findings profile. Individual employer reports remain confidential to that employer.
          </p>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <MetricCard label="Audits approved" value={formatNumber(outcomes.approvedReports)} />
            <MetricCard
              label="Average compliance score"
              value={outcomes.averageScore === null ? '—' : formatPercent(outcomes.averageScore, 1)}
            />
            <MetricCard label="Latest approval" value={formatDate(outcomes.latestApproval)} />
          </div>

          <div className="mt-12">
            <h2 className="text-2xl font-bold text-ink">Outcomes by audit type</h2>
            {outcomes.byType.length === 0 ? (
              <p className="mt-4 rounded-xl border border-line p-8 text-center text-sm text-ink-muted">
                No audits have been approved on this platform yet. Completed audits will be summarised here as
                soon as the first verification is closed.
              </p>
            ) : (
              <div className="mt-6 overflow-hidden rounded-xl border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-head">Audit type</th>
                      <th className="table-head text-center">Reports</th>
                      <th className="table-head text-center">Average score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.byType.map((row) => (
                      <tr key={row.report_type} className="transition-colors duration-150 hover:bg-surface-muted">
                        <td className="table-cell font-medium text-ink">{row.report_type}</td>
                        <td className="table-cell text-center text-ink-soft">{formatNumber(row.total)}</td>
                        <td className="table-cell text-center text-ink-soft">
                          {row.average_score === null ? '—' : formatPercent(row.average_score, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {publishedReports.length > 0 && (
            <div className="mt-14">
              <h2 className="text-2xl font-bold text-ink">Published reports</h2>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {publishedReports.map((report) => (
                  <article key={String(report.id)} className="rounded-xl border border-line p-6">
                    <h3 className="text-lg font-semibold text-ink">{String(report.title)}</h3>
                    {report.subtitle && <p className="mt-1 text-sm text-ink-muted">{String(report.subtitle)}</p>}
                    <p className="mt-3 text-xs text-ink-muted">Published {formatDate(report.published_at as string | null)}</p>
                    <Link href={`/reports/${String(report.slug)}`} className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
                      View report
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="mt-14 rounded-xl bg-brand-50 p-8">
            <h2 className="text-xl font-semibold text-brand-900">Need a report for your own establishment?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-800">
              Employers on the platform receive their audit reports directly in the employer portal, with the
              report number, findings, scores and the corrective actions required — and every version retained
              for inspection.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                Request a Demo
              </Link>
              <Link href="/login" className="rounded-lg border border-brand-300 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100">
                Employer Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-6">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}
