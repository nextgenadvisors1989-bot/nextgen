'use client';

/**
 * Admin > Error Logs.
 *
 * The incident queue. Every 500 the API raises is captured with its stack trace
 * (see `handleRouteError` → `logError`), so this screen is about triage rather
 * than browsing: filter to what is open and severe, open the trace, then resolve
 * it with the note that explains the fix — which is itself an auditable action.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ERROR_SEVERITIES } from '@/lib/validations/audit-log.validation';
import { LogStats, SeverityBadge } from '@/components/logs/shared';

interface ErrorRow {
  id: number;
  error_code: string | null;
  error_type: string;
  message: string;
  route: string | null;
  request_method: string | null;
  severity: string;
  is_resolved: number | boolean;
  resolved_by: number | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  actor_name?: string | null;
}

interface Option {
  value: string;
  label: string;
}

export function ErrorLogsTable({ canResolve, canExport }: { canResolve: boolean; canExport: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<ErrorRow>({
    endpoint: '/api/admin/error-logs',
    initialFilters: {
      search: '', severity: 'all', resolved: 'open', error_type: 'all', route_name: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const [resolveTarget, setResolveTarget] = useState<ErrorRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const stats = list.extra.stats as Record<string, number> | undefined;
  const facets = (list.extra.facets as { types?: Option[]; routes?: Option[] } | undefined) ?? {};

  async function submitResolution(resolved: boolean) {
    if (!resolveTarget) return;
    if (resolved && !note.trim()) {
      errorToast('A note is required', 'Say what fixed it — the next person reading this log needs it.');
      return;
    }
    setSaving(true);
    const result = await api.patch(`/api/admin/error-logs/${resolveTarget.id}`, {
      resolved,
      resolution_note: resolved ? note.trim() : null,
    });
    setSaving(false);
    if (result.ok) {
      success(resolved ? 'Error resolved' : 'Error reopened', result.message ?? '');
      setResolveTarget(null);
      setNote('');
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not update the error', result.message);
    }
  }

  const columns: Column<ErrorRow>[] = [
    {
      key: 'when',
      header: 'Raised',
      width: 160,
      render: (row) => (
        <span className="text-ink-soft">
          {formatDateTime(row.created_at)}
          <span className="block text-xs text-ink-muted">#{row.id}</span>
        </span>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/error-logs/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.message, 62)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.error_type}{row.error_code ? ` · ${row.error_code}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          <span className="font-mono text-xs">{row.route ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{row.request_method ?? ''}</span>
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (row) => <SeverityBadge severity={row.severity} />,
    },
    {
      key: 'state',
      header: 'State',
      render: (row) => (Number(row.is_resolved) ? (
        <span className="flex flex-col items-start gap-1">
          <Badge tone="success" dot>Resolved</Badge>
          {row.resolved_by_name?.trim() ? (
            <span className="text-xs text-ink-muted">{row.resolved_by_name.trim()} · {row.resolved_at ? formatDateTime(row.resolved_at) : ''}</span>
          ) : null}
        </span>
      ) : (
        <Badge tone="warning" dot>Open</Badge>
      )),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-2">
          <Link href={`/admin/error-logs/${row.id}`} className="text-xs font-medium text-brand-600 hover:underline">
            Trace
          </Link>
          {canResolve && (
            <button
              type="button"
              className="text-xs font-medium text-ink-soft hover:underline"
              onClick={() => { setResolveTarget(row); setNote(row.resolution_note ?? ''); }}
            >
              {Number(row.is_resolved) ? 'Reopen' : 'Resolve'}
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <LogStats
        items={[
          { label: 'Errors captured', value: formatNumber(stats?.total ?? list.pagination.total), hint: `${formatNumber(stats?.last24 ?? 0)} in the last 24 hours`, tone: 'brand' },
          { label: 'Open', value: formatNumber(stats?.open ?? 0), hint: 'Awaiting triage', tone: 'amber' },
          { label: 'Critical or fatal', value: formatNumber(stats?.critical ?? 0), hint: 'Open incidents at the top severity', tone: 'red' },
          { label: 'Resolved', value: formatNumber(stats?.resolved ?? 0), hint: `${formatNumber(stats?.types ?? 0)} error types across ${formatNumber(stats?.routes ?? 0)} routes`, tone: 'emerald' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search message, route, type or code…' },
            {
              key: 'resolved', type: 'select', label: 'State',
              options: [
                { value: 'open', label: 'Open only' },
                { value: 'resolved', label: 'Resolved only' },
                { value: 'all', label: 'Everything' },
              ],
            },
            { key: 'severity', type: 'select', label: 'Severity', options: [{ value: 'all', label: 'Any severity' }, ...ERROR_SEVERITIES.map((value) => ({ value, label: value }))] },
            { key: 'error_type', type: 'select', label: 'Error type', options: [{ value: 'all', label: 'All types' }, ...(facets.types ?? [])] },
            { key: 'route_name', type: 'select', label: 'Route', options: [{ value: 'all', label: 'All routes' }, ...(facets.routes ?? [])] },
            { key: 'from_date', type: 'date', label: 'From' },
            { key: 'to_date', type: 'date', label: 'To' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            canExport ? (
              <Button
                variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `error-logs-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Raised at', 'Id', 'Type', 'Code', 'Message', 'Route', 'Method', 'Severity', 'State', 'Resolved by', 'Resolved at', 'Note'],
                  list.data.map((row) => [
                    row.created_at, row.id, row.error_type, row.error_code, row.message, row.route,
                    row.request_method, row.severity, Number(row.is_resolved) ? 'Resolved' : 'Open',
                    row.resolved_by_name ?? '', row.resolved_at ?? '', row.resolution_note ?? '',
                  ])
                )}
              >
                Export CSV
              </Button>
            ) : undefined
          }
        />

        <DataTable<ErrorRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No errors to show"
          emptySubtitle="An empty queue is the good outcome — captured failures appear here with their stack traces."
          emptyAction={list.filters.resolved === 'open'
            ? <Button size="sm" variant="outline" onClick={() => list.setFilter('resolved', 'all')}>Show resolved errors</Button>
            : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title={resolveTarget && Number(resolveTarget.is_resolved) ? 'Reopen this error?' : 'Resolve this error'}
        description={resolveTarget ? truncate(resolveTarget.message, 140) : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button
              variant={resolveTarget && Number(resolveTarget.is_resolved) ? 'outline' : 'primary'}
              loading={saving}
              onClick={() => submitResolution(!(resolveTarget && Number(resolveTarget.is_resolved)))}
            >
              {resolveTarget && Number(resolveTarget.is_resolved) ? 'Reopen Error' : 'Mark Resolved'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resolveTarget && Number(resolveTarget.is_resolved) ? (
            <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">
              Reopening puts this error back in the open queue
              {resolveTarget.resolution_note ? <> — it was resolved with “{resolveTarget.resolution_note}”</> : null}.
            </p>
          ) : (
            <>
              <Textarea
                label="What fixed it?" required rows={3} value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For example: the compliance list query was missing an index; added it in migration 021."
              />
              <Input
                label="Record" value={resolveTarget ? `#${resolveTarget.id} · ${resolveTarget.route ?? 'unknown route'}` : ''}
                readOnly disabled
              />
            </>
          )}
        </div>
      </Modal>

      {canResolve && list.data.length > 0 && (
        <p className="px-1 text-xs text-ink-muted">
          Tip: resolve incidents from the Trace page too — it shows the full stack trace and any repeat occurrences first.
        </p>
      )}

      {!canResolve && (
        <p className="px-1 text-xs text-ink-muted">
          Your role can read the error queue but not resolve incidents. <LinkButton href="/admin/activity-logs" size="sm" variant="ghost">Open the activity log</LinkButton>
        </p>
      )}
    </div>
  );
}
