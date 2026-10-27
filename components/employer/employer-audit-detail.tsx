'use client';

/**
 * One audit of the establishment: the assignment, its trail and its files.
 *
 * The company is a party to the audit, not its author — so the screen reads the
 * record and the history and leaves the writing to the auditor.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatBytes } from '@/lib/utils/formatting';

interface AuditDetail {
  assignment: Record<string, unknown>;
  history: Record<string, unknown>[];
  files: Record<string, unknown>[];
}

const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));

export function EmployerAuditDetail({ assignmentId }: { assignmentId: number }) {
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<AuditDetail>(`/api/employer/audits/${assignmentId}`);
        if (!response.ok) { setError(response.message); return; }
        setDetail(response.data ?? null);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : 'The audit could not be loaded');
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <EmptyState title="That audit could not be opened" subtitle={error} />;
  if (!detail) return <EmptyState title="Audit not found" />;

  const assignment = detail.assignment;

  return (
    <div className="space-y-6">
      <Card padded={false}>
        <CardHeader
          title={String(assignment.audit_title ?? 'Audit')}
          description={`${text(assignment.assignment_number)}${assignment.audit_type ? ` · ${String(assignment.audit_type)}` : ''}`}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge status={String(assignment.status ?? '—')} />
              <LinkButton href="/employer/audits" variant="outline" size="sm">All audits</LinkButton>
            </div>
          }
        />
        <CardBody>
          <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Auditor', assignment.auditor_name],
              ['Unit', assignment.unit_name],
              ['Department', assignment.department_name],
              ['Priority', assignment.priority],
              ['Starts', assignment.start_date ? formatDate(String(assignment.start_date)) : null],
              ['Due', assignment.due_date ? formatDate(String(assignment.due_date)) : null],
              ['Completed', assignment.completed_at ? formatDateTime(String(assignment.completed_at)) : null],
              ['Progress', assignment.progress_percent === null || assignment.progress_percent === undefined
                ? null : `${String(assignment.progress_percent)}%`],
              ['Scope', assignment.scope],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
                <dt className="text-sm text-ink-muted">{String(label)}</dt>
                <dd className="text-right text-sm font-medium text-ink">{text(value)}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="What has happened" description="The audit's own trail, oldest first." />
          {detail.history.length ? (
            <ol className="divide-y divide-line">
              {detail.history.map((entry, index) => (
                <li key={String(entry.id ?? index)} className="flex items-start gap-3 px-6 py-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{text(entry.description ?? entry.action)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[entry.changed_by_name, entry.created_at ? formatDateTime(String(entry.created_at)) : null]
                        .filter(Boolean).map(String).join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : <EmptyState compact title="Nothing logged yet" />}
        </Card>

        <Card padded={false}>
          <CardHeader title="Documents" description="Papers filed against this audit." />
          {detail.files.length ? (
            <ul className="divide-y divide-line">
              {detail.files.map((file, index) => (
                <li key={String(file.id ?? index)} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{text(file.original_name ?? file.file_name)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[file.category, file.size_bytes ? formatBytes(Number(file.size_bytes)) : null]
                        .filter(Boolean).map(String).join(' · ') || '—'}
                    </p>
                  </div>
                  {file.id ? (
                    <Link href={`/api/files/${String(file.id)}/download`} className="text-sm font-medium text-brand-600 hover:underline">
                      Download
                    </Link>
                  ) : <Badge tone="slate">—</Badge>}
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="No documents" subtitle="Papers filed against this audit appear here." />}
        </Card>
      </div>
    </div>
  );
}
