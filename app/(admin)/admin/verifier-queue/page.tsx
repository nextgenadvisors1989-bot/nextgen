import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { pendingVerificationQueue } from '@/repositories/audit-report.repository';
import { verifierOptions } from '@/repositories/audit-assignment.repository';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

export const metadata: Metadata = { title: 'Verifier Queue' };
export const dynamic = 'force-dynamic';

interface QueueRow {
  id: number;
  report_number: string;
  audit_title: string;
  employer_name?: string | null;
  auditor_name?: string | null;
  verifier_name?: string | null;
  status: string;
  vendor: string;
  submitted_at: string | null;
  verifier_due_date: string | null;
}

interface VerifierOption {
  id: number;
  name: string;
  pending?: number | null;
  overdue?: number | null;
}

function daysRemaining(date: string): number {
  const due = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Everything waiting for verification, oldest first, beside how much each verifier
 * is already carrying.
 *
 * The point of the screen is the mismatch: a report that has sat unassigned for a
 * fortnight next to a verifier with nothing on their desk.
 */
export default async function AdminVerifierQueuePage() {
  await requireAdminApi(['audit_report.read']);

  const [queue, verifiers] = await Promise.all([
    pendingVerificationQueue(),
    verifierOptions(),
  ]);

  const rows = queue as unknown as QueueRow[];
  const people = verifiers as unknown as VerifierOption[];
  const unassigned = rows.filter((row) => !row.verifier_name).length;
  const overdue = rows.filter((row) => row.verifier_due_date && daysRemaining(row.verifier_due_date) < 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verifier Queue"
        description="Reports filed and waiting for a decision, oldest first, beside what each verifier is already carrying."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Verifier Queue' }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting for a decision" value={formatNumber(rows.length)} tone="brand" />
        <StatCard label="Nobody allocated" value={formatNumber(unassigned)} tone={unassigned ? 'amber' : 'slate'} />
        <StatCard label="Past their due date" value={formatNumber(overdue)} tone={overdue ? 'red' : 'slate'} />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Waiting for verification"
          description="A report appears here the moment an auditor files it and leaves when a verifier decides."
          action={<Badge tone="slate">{people.length} verifier(s)</Badge>}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing waiting for verification"
            subtitle="Every filed report has a decision. New submissions appear here as auditors file them."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Report', 'Employer', 'Auditor', 'With', 'Submitted', 'Due', 'Status'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const remaining = row.verifier_due_date ? daysRemaining(row.verifier_due_date) : null;
                  const late = remaining !== null && remaining < 0;
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface-muted/60">
                      <td className="px-6 py-3">
                        <Link href={`/admin/audit-reports/${row.id}/review`} className="font-medium text-brand-600 hover:underline">
                          {truncate(row.audit_title, 44)}
                        </Link>
                        <span className="block text-xs text-ink-muted">{row.report_number}</span>
                      </td>
                      <td className="px-6 py-3 text-ink-soft">{row.employer_name ?? '—'}</td>
                      <td className="px-6 py-3 text-ink-soft">{row.auditor_name ?? '—'}</td>
                      <td className="px-6 py-3">
                        {row.verifier_name ? <Badge tone="violet">{row.verifier_name}</Badge> : <Badge tone="warning">Unassigned</Badge>}
                      </td>
                      <td className="px-6 py-3 text-ink-muted">{row.submitted_at ? formatDateTime(row.submitted_at) : '—'}</td>
                      <td className={`px-6 py-3 ${late ? 'font-medium text-red-600' : 'text-ink-soft'}`}>
                        {row.verifier_due_date
                          ? `${formatDate(row.verifier_due_date)} (${late ? `${Math.abs(remaining!)}d late` : `${remaining}d left`})`
                          : '—'}
                      </td>
                      <td className="px-6 py-3"><StatusBadge status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padded={false}>
        <CardHeader title="Who is carrying what" description="Open reports per verifier, with what is already past its date." />
        {people.length === 0 ? (
          <EmptyState title="No verifiers on the platform yet" subtitle="Add one from the user register and give them the verifier role." />
        ) : (
          <ul className="divide-y divide-line">
            {people.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-4 px-6 py-3">
                <span className="text-sm font-medium text-ink">{person.name}</span>
                <div className="flex items-center gap-3">
                  <Badge tone={Number(person.pending ?? 0) > 0 ? 'brand' : 'slate'}>
                    {formatNumber(Number(person.pending ?? 0))} open
                  </Badge>
                  {Number(person.overdue ?? 0) > 0
                    ? <Badge tone="danger">{formatNumber(Number(person.overdue ?? 0))} late</Badge>
                    : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
