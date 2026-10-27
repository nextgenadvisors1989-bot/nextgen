import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { identityOrNull, myAuditStats } from '@/services/auditor-workspace.service';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'My Profile' };
export const dynamic = 'force-dynamic';

/**
 * The auditor's own record: who the platform has them as, where they are posted and
 * the state of their caseload.
 *
 * A login without an `auditors` row is normal — a verifier may hold the auditor
 * panel for review work — so the page resolves the identity with `identityOrNull`
 * and explains the situation instead of failing.
 */
export default async function AuditorProfilePage() {
  const user = await requirePanel(['auditor', 'admin', 'super_admin']);
  const identity = await identityOrNull(user.id);
  const stats = identity ? await myAuditStats(identity.id) : null;

  const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Your auditor record, your specialisation and the audits you are carrying."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'My Profile' }]}
      />

      <Card padded={false}>
        <CardHeader
          title={user.fullName}
          description={`${user.email} · ${user.primaryRole.replace(/_/g, ' ')}`}
          action={<Badge tone="slate">{user.roles.map((role) => role.name).join(', ') || 'No role'}</Badge>}
        />
        <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-3">
          {[
            ['Username', user.username],
            ['Mobile', user.mobile],
            ['Last sign-in', user.lastLoginAt ? formatDateTime(user.lastLoginAt) : null],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
              <dt className="text-sm text-ink-muted">{String(label)}</dt>
              <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {identity ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Assigned audits" value={formatNumber(Number(stats?.total ?? 0))} tone="brand" />
            <StatCard label="In progress" value={formatNumber(Number(stats?.inProgress ?? 0))} tone="amber" />
            <StatCard label="Completed" value={formatNumber(Number(stats?.approved ?? 0))} tone="emerald" />
            <StatCard
              label="Overdue"
              value={formatNumber(Number(stats?.overdue ?? 0))}
              tone={Number(stats?.overdue ?? 0) ? 'red' : 'slate'}
            />
          </div>

          <Card padded={false}>
            <CardHeader
              title="Auditor record"
              description="Held by the platform. Ask an administrator if any of it needs correcting."
              action={<LinkButton href="/auditor/audits" variant="outline" size="sm">My audits</LinkButton>}
            />
            <dl className="grid gap-x-8 px-6 py-2 sm:grid-cols-3">
              {[
                ['Auditor code', identity.auditor_code],
                ['Name', identity.name],
                ['Specialisation', identity.specialization],
                ['Email', identity.email],
                ['Phone', identity.phone],
                ['Open corrections', formatNumber(Number(stats?.openCorrections ?? 0))],
                ['Reports filed', formatNumber(Number(stats?.reports ?? 0))],
                ['Average score', stats?.averageScore === null || stats?.averageScore === undefined
                  ? null : `${formatNumber(Number(stats.averageScore), 1)}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
                  <dt className="text-sm text-ink-muted">{String(label)}</dt>
                  <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      ) : (
        <EmptyState
          title="No auditor record is linked to your login"
          subtitle="You hold the auditor panel, but the platform has no auditors row against your account — a verifier or administrator account behaves this way. An administrator can link one from the auditor register."
          action={<LinkButton href="/auditor/modules" variant="outline">Go to my modules</LinkButton>}
        />
      )}
    </div>
  );
}
