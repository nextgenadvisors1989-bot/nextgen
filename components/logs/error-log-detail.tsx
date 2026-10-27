'use client';

/**
 * One captured error, in full.
 *
 * The trace page exists so an operator can decide without leaving the platform:
 * the message and stack, where it happened, the request that triggered it, what
 * it looked like the other times it fired, and the resolve/reopen action with
 * the note that becomes part of the audit trail.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { truncate } from '@/lib/utils/formatting';
import { SeverityBadge } from '@/components/logs/shared';
import { ComplianceActivity } from '@/components/compliance/shared';

export interface ErrorRecord {
  id: number;
  error_code: string | null;
  error_type: string;
  message: string;
  stack_trace: string | null;
  file_path: string | null;
  line_number: number | null;
  route: string | null;
  request_method: string | null;
  request_body: string | null;
  severity: string;
  is_resolved: number | boolean;
  user_id: number | null;
  actor_name?: string | null;
  ip_address: string | null;
  resolved_by: number | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

interface SimilarRow {
  id: number;
  message: string;
  route: string | null;
  severity: string;
  is_resolved: number | boolean;
  created_at: string;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="max-w-[64%] break-words text-right text-sm text-ink-soft">{children}</dd>
    </div>
  );
}

export function ErrorLogDetail({
  error, similar, canResolve,
}: {
  error: ErrorRecord;
  similar: SimilarRow[];
  canResolve: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [note, setNote] = useState(error.resolution_note ?? '');
  const [saving, setSaving] = useState(false);

  const resolved = Boolean(Number(error.is_resolved));

  async function submit(nextResolved: boolean) {
    if (nextResolved && !note.trim()) {
      errorToast('A note is required', 'Say what fixed it — the next person reading this log needs it.');
      return;
    }
    setSaving(true);
    const result = await api.patch(`/api/admin/error-logs/${error.id}`, {
      resolved: nextResolved,
      resolution_note: nextResolved ? note.trim() : null,
    });
    setSaving(false);
    if (result.ok) {
      success(nextResolved ? 'Error resolved' : 'Error reopened', result.message ?? '');
      router.refresh();
    } else {
      errorToast('Could not update the error', result.message);
    }
  }

  const similarColumns: Column<SimilarRow>[] = [
    {
      key: 'when',
      header: 'When',
      width: 160,
      render: (row) => <span className="text-ink-soft">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'message',
      header: 'Message',
      render: (row) => (
        <Link href={`/admin/error-logs/${row.id}`} className="text-brand-600 hover:underline">
          {truncate(row.message, 70)}
        </Link>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-ink-soft">{row.route ?? '—'}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (Number(row.is_resolved) ? <Badge tone="success">Resolved</Badge> : <Badge tone="warning">Open</Badge>),
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={error.severity} />
              {resolved ? <Badge tone="success" dot>Resolved</Badge> : <Badge tone="warning" dot>Open</Badge>}
              <Badge tone="slate">{error.error_type}</Badge>
              {error.error_code ? <Badge tone="info">{error.error_code}</Badge> : null}
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-ink">{error.message}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Raised {formatDateTime(error.created_at)}
              {error.route ? <> on <span className="font-mono text-xs">{error.request_method ?? ''} {error.route}</span></> : null}
              {error.file_path ? <> · {error.file_path}{error.line_number ? `:${error.line_number}` : ''}</> : null}
            </p>
          </div>

          {resolved ? (
            <div className="text-right text-sm">
              <p className="text-ink-soft">Resolved by {error.resolved_by_name?.trim() || `user #${error.resolved_by}`}</p>
              <p className="text-xs text-ink-muted">{error.resolved_at ? formatDateTime(error.resolved_at) : ''}</p>
              {canResolve && (
                <Button size="sm" variant="outline" className="mt-2" loading={saving} onClick={() => submit(false)}>
                  Reopen
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card padded={false}>
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Stack trace</h3>
            <pre className="max-h-96 overflow-auto px-4 py-3 text-xs leading-relaxed text-ink-soft">
              {error.stack_trace ?? 'No stack trace was captured for this entry.'}
            </pre>
          </Card>

          {error.request_body && (
            <Card padded={false}>
              <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
                Request body <span className="font-normal text-ink-muted">(secrets redacted at capture time)</span>
              </h3>
              <pre className="max-h-64 overflow-auto px-4 py-3 text-xs text-ink-soft">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(error.request_body), null, 2);
                  } catch {
                    return error.request_body;
                  }
                })()}
              </pre>
            </Card>
          )}

          {canResolve && !resolved && (
            <Card>
              <h3 className="text-sm font-semibold text-ink">Resolve this incident</h3>
              <p className="mt-1 text-sm text-ink-muted">
                The note is stored with the error and written to the activity log, so the same failure returning next
                month is visibly a regression rather than a fresh mystery.
              </p>
              <div className="mt-3 space-y-3">
                <Textarea
                  label="What fixed it?" rows={3} value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="For example: the payroll list query did not exclude soft-deleted runs; corrected the WHERE clause."
                />
                <Button loading={saving} onClick={() => submit(true)}>Mark Resolved</Button>
              </div>
            </Card>
          )}

          {resolved && error.resolution_note && (
            <Card>
              <h3 className="text-sm font-semibold text-ink">Resolution</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{error.resolution_note}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card padded={false}>
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Capture details</h3>
            <dl>
              <DetailRow label="Error id">#{error.id}</DetailRow>
              <DetailRow label="Type">{error.error_type}</DetailRow>
              <DetailRow label="Severity"><SeverityBadge severity={error.severity} /></DetailRow>
              <DetailRow label="Route">{error.route ?? '—'}</DetailRow>
              <DetailRow label="Method">{error.request_method ?? '—'}</DetailRow>
              <DetailRow label="Location">
                {error.file_path ? `${error.file_path}${error.line_number ? `:${error.line_number}` : ''}` : '—'}
              </DetailRow>
              <DetailRow label="Reported by">{error.actor_name?.trim() || (error.user_id ? `user #${error.user_id}` : 'System')}</DetailRow>
              <DetailRow label="IP address">{error.ip_address ?? '—'}</DetailRow>
              <DetailRow label="Raised at">{formatDateTime(error.created_at)}</DetailRow>
            </dl>
          </Card>

          <Card padded={false}>
            <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Times this fired <span className="font-normal text-ink-muted">({similar.length})</span>
            </h3>
            <DataTable<SimilarRow>
              columns={similarColumns}
              data={similar}
              rowKey={(row) => row.id}
              emptyTitle="No other occurrences"
              emptySubtitle="This message has not repeated."
            />
          </Card>

          <ComplianceActivity entityType="error_log" entityId={error.id} title="Triage history" />
        </div>
      </div>
    </div>
  );
}
