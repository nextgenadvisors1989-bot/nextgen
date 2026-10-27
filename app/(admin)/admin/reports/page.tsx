import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { reportCharts, reportStats } from '@/services/audit-report.service';
import { formatNumber } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'Reports & Analytics' };
export const dynamic = 'force-dynamic';

interface TrendRow {
  period: string;
  reports: number;
  avg_score: number | null;
  critical: number;
}

/**
 * The platform's reporting view: how many audits were filed, how they scored and
 * how many critical findings came out of them, month by month.
 *
 * The numbers come from the same aggregates the dashboards use, so a figure here
 * and a figure there are never two different answers to one question.
 */
export default async function AdminReportsPage() {
  await requireAdminApi(['audit_report.read']);
  const [stats, charts] = await Promise.all([reportStats(), reportCharts()]);

  const trend = (charts?.[0] ?? null) as { data?: TrendRow[] } | null;
  const rows = trend?.data ?? [];
  const cards: { label: string; value: number; tone: 'brand' | 'emerald' | 'amber' | 'slate' | 'red' }[] = [
    { label: 'Reports on record', value: Number(stats?.total ?? 0), tone: 'brand' },
    { label: 'Approved', value: Number(stats?.approved ?? 0), tone: 'emerald' },
    { label: 'Awaiting verification', value: Number(stats?.submitted ?? 0), tone: 'amber' },
    { label: 'Critical findings', value: Number(stats?.criticalFindings ?? 0), tone: 'red' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="What the platform's audits have produced: volume, scores and critical findings, month by month."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Reports & Analytics' }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={formatNumber(card.value)} tone={card.tone} />
        ))}
      </div>

      <Card padded={false}>
        <CardHeader
          title="Month by month"
          description="Reports filed, the average score they carried and the critical findings they raised."
        />
        {rows.length === 0 ? (
          <EmptyState title="No reports filed yet" subtitle="The trend appears once auditors start filing reports." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Month', 'Reports filed', 'Average score', 'Critical findings'].map((header, index) => (
                    <th
                      key={header}
                      className={`px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted ${index ? 'text-right' : ''}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.period} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 font-medium text-ink">{row.period}</td>
                    <td className="px-6 py-3 text-right text-ink-soft">{formatNumber(Number(row.reports))}</td>
                    <td className="px-6 py-3 text-right text-ink-soft">{formatNumber(Number(row.avg_score ?? 0), 1)}%</td>
                    <td className={`px-6 py-3 text-right ${Number(row.critical) > 0 ? 'font-medium text-red-600' : 'text-ink-soft'}`}>
                      {formatNumber(Number(row.critical ?? 0))}
                    </td>
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
