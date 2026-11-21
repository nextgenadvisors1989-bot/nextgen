import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSetupChecks, summariseChecks, type CheckStatus } from '@/services/setup-check.service';

export const metadata: Metadata = { title: 'Go-live checklist' };
export const dynamic = 'force-dynamic';

const LABEL: Record<CheckStatus, { text: string; tone: 'success' | 'danger' | 'warning' }> = {
  ok: { text: 'Done', tone: 'success' },
  todo: { text: 'To do', tone: 'danger' },
  warn: { text: 'Check', tone: 'warning' },
};

export default async function SetupPage() {
  await requirePageUser();
  const checks = await getSetupChecks();
  const sum = summariseChecks(checks);
  const groups = [...new Set(checks.map((check) => check.group))];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Go-live checklist"
        description="What is still sample or missing before real clients use the platform. This list is worked out from your live data every time you open it."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Go-live checklist' }]}
      />
      <Card>
        <p className="text-sm text-ink-soft" role="status">
          <strong className="text-ink">{sum.ok} of {sum.total}</strong> are in order.
          {sum.todo ? <> <strong className="text-red-700">{sum.todo} must be done</strong> before launch.</> : null}
          {sum.warn ? <> {sum.warn} worth a look.</> : null}
          {!sum.todo && !sum.warn ? ' Everything is ready.' : null}
        </p>
      </Card>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`} className="space-y-2">
          <h2 id={`group-${group}`} className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{group}</h2>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {checks.filter((check) => check.group === group).map((check) => (
                <li key={check.id} className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-5">
                  <Badge tone={LABEL[check.status].tone}>{LABEL[check.status].text}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{check.title}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{check.detail}</p>
                  </div>
                  {check.href && check.status !== 'ok' && (
                    <Link href={check.href} className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-slate-50">{check.action ?? 'Open'}</Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
