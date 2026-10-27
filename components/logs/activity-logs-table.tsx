'use client';

/**
 * Admin > Activity Logs.
 *
 * The platform-wide answer to "who did what, when, from where". Every mutation
 * in the system writes here, so the screen is built for reading: filter by
 * module, action, actor, role, entity, outcome and severity, search across the
 * description and the request, then open a row for its before/after payload.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useList } from '@/lib/utils/use-list';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ACTIVITY_SEVERITIES, ACTIVITY_STATUSES } from '@/lib/validations/audit-log.validation';
import {
  ActionBadge, ActivityTrend, ChangeTable, LogStats, LogValue, SeverityBadge, StatusBadge,
  parseJson, type TrendPoint,
} from '@/components/logs/shared';

interface ActivityRow {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  employer_id: number | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  description: string | null;
  old_values_json: string | null;
  new_values_json: string | null;
  changed_fields: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_method: string | null;
  request_url: string | null;
  status: string | null;
  severity: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface Option {
  value: string;
  label: string;
}

export function ActivityLogsTable({ canExport }: { canExport: boolean }) {
  const list = useList<ActivityRow>({
    endpoint: '/api/admin/activity-logs',
    initialFilters: {
      search: '', module: 'all', action: 'all', user_id: 'all', user_role: 'all',
      entity_type: 'all', status: 'all', severity: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const [selected, setSelected] = useState<ActivityRow | null>(null);

  const stats = list.extra.stats as Record<string, number> | undefined;
  const options = (list.extra.options as {
    actions?: Option[]; modules?: Option[]; roles?: Option[]; entities?: Option[];
    actors?: { id: number; name: string; total: number }[];
  } | undefined) ?? {};
  const trend = (list.extra.trend as TrendPoint[] | undefined) ?? [];
  const leaderboard = (list.extra.leaderboard as {
    modules: { module: string; total: number; failed: number }[];
    actors: { name: string; role: string | null; total: number }[];
  } | undefined);

  const changes = selected ? parseJson<Record<string, { from?: unknown; to?: unknown }>>(selected.changed_fields) : null;
  const oldValues = selected ? parseJson<Record<string, unknown>>(selected.old_values_json) : null;
  const newValues = selected ? parseJson<Record<string, unknown>>(selected.new_values_json) : null;

  const columns: Column<ActivityRow>[] = [
    {
      key: 'when',
      header: 'When',
      width: 160,
      render: (row) => (
        <span className="text-ink-soft">
          {formatDateTime(row.created_at)}
          <span className="block text-xs text-ink-muted">{row.ip_address ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Who',
      render: (row) => (
        <span className="text-ink-soft">
          <span className="font-medium text-ink">{row.user_name ?? 'System'}</span>
          <span className="block text-xs text-ink-muted">{row.user_role ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <ActionBadge value={row.action} />
          <span className="text-xs text-ink-muted">{row.module}</span>
        </span>
      ),
    },
    {
      key: 'what',
      header: 'What happened',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-ink-soft">{truncate(row.description ?? '—', 72)}</p>
          {row.entity_label ? (
            <span className="block text-xs text-ink-muted">
              {row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''} · {truncate(row.entity_label, 40)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      hideOnMobile: true,
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.severity && row.severity !== 'info' ? <SeverityBadge severity={row.severity} /> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => setSelected(row)}
        >
          Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <LogStats
        items={[
          { label: 'Logged actions', value: formatNumber(stats?.total ?? list.pagination.total), hint: `${formatNumber(stats?.today ?? 0)} today`, tone: 'brand' },
          { label: 'Distinct actors', value: formatNumber(stats?.actors ?? 0), hint: 'Users and system processes that wrote an entry', tone: 'slate' },
          { label: 'Failed actions', value: formatNumber(stats?.failed ?? 0), hint: 'Rejected or errored attempts', tone: 'red' },
          { label: 'High severity', value: formatNumber(stats?.severe ?? 0), hint: 'Marked high or critical by the writer', tone: 'amber' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityTrend points={trend} title="Actions per day (last 14 days)" />
        </div>
        <Card>
          <h3 className="text-sm font-semibold text-ink">Where the activity is</h3>
          <div className="mt-3 space-y-2">
            {(leaderboard?.modules ?? []).map((row) => (
              <button
                key={row.module}
                type="button"
                onClick={() => list.setFilter('module', row.module)}
                className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-1.5 text-left text-sm hover:border-brand-300"
              >
                <span className="text-ink-soft">{row.module}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{formatNumber(row.total)}</span>
                  {Number(row.failed) > 0 && <Badge tone="danger">{formatNumber(row.failed)} failed</Badge>}
                </span>
              </button>
            ))}
            {!leaderboard?.modules?.length && <p className="text-sm text-ink-muted">No activity recorded yet.</p>}
          </div>
          {leaderboard?.actors?.length ? (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink">Busiest users</h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {leaderboard.actors.map((actor) => (
                  <li key={actor.name} className="flex items-center justify-between">
                    <span>{actor.name}{actor.role ? <span className="text-xs text-ink-muted"> · {actor.role}</span> : null}</span>
                    <span className="font-semibold text-ink">{formatNumber(actor.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search description, record, user or URL…' },
            { key: 'module', type: 'select', label: 'Module', options: [{ value: 'all', label: 'All modules' }, ...(options.modules ?? [])] },
            { key: 'action', type: 'select', label: 'Action', options: [{ value: 'all', label: 'All actions' }, ...(options.actions ?? [])] },
            {
              key: 'user_id', type: 'select', label: 'User',
              options: [
                { value: 'all', label: 'Anyone' },
                ...(options.actors ?? []).map((actor) => ({ value: String(actor.id), label: `${actor.name} (${actor.total})` })),
              ],
            },
            { key: 'user_role', type: 'select', label: 'Role', options: [{ value: 'all', label: 'All roles' }, ...(options.roles ?? [])] },
            { key: 'entity_type', type: 'select', label: 'Entity', options: [{ value: 'all', label: 'All entities' }, ...(options.entities ?? [])] },
            { key: 'status', type: 'select', label: 'Result', options: [{ value: 'all', label: 'Any result' }, ...ACTIVITY_STATUSES.map((value) => ({ value, label: value }))] },
            { key: 'severity', type: 'select', label: 'Severity', options: [{ value: 'all', label: 'Any severity' }, ...ACTIVITY_SEVERITIES.map((value) => ({ value, label: value }))] },
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
                  `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['When', 'User', 'Role', 'Action', 'Module', 'Entity', 'Record', 'Description', 'Result', 'Severity', 'IP', 'Method', 'URL', 'Duration (ms)'],
                  list.data.map((row) => [
                    row.created_at, row.user_name, row.user_role, row.action, row.module,
                    row.entity_type, row.entity_label, row.description, row.status, row.severity,
                    row.ip_address, row.request_method, row.request_url, row.duration_ms ?? '',
                  ])
                )}
              >
                Export CSV
              </Button>
            ) : undefined
          }
        />

        <DataTable<ActivityRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No activity matches these filters"
          emptySubtitle="Widen the date range or clear a filter to see more of the trail."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.action} · ${selected.module}` : ''}
        description={selected?.description ?? ''}
        size="xl"
        footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['When', formatDateTime(selected.created_at)],
                ['User', `${selected.user_name ?? 'System'}${selected.user_role ? ` (${selected.user_role})` : ''}`],
                ['Entity', `${selected.entity_type ?? '—'}${selected.entity_id ? ` #${selected.entity_id}` : ''}`],
                ['Record', selected.entity_label ?? '—'],
                ['Result', selected.status ?? '—'],
                ['Severity', selected.severity ?? '—'],
                ['IP address', selected.ip_address ?? '—'],
                ['Request', `${selected.request_method ?? ''} ${selected.request_url ?? ''}`.trim() || '—'],
                ['Duration', selected.duration_ms !== null && selected.duration_ms !== undefined ? `${selected.duration_ms} ms` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 break-words text-sm text-ink-soft">{value}</dd>
                </div>
              ))}
            </dl>

            {selected.user_agent && (
              <div className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">User agent</p>
                <p className="mt-0.5 break-words text-xs text-ink-soft">{selected.user_agent}</p>
              </div>
            )}

            {changes && Object.keys(changes).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-ink">Changed fields</h4>
                <ChangeTable changes={changes} />
              </div>
            )}

            {(oldValues || newValues) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {oldValues && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-ink">Before</h4>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-soft">
                      {JSON.stringify(oldValues, null, 2)}
                    </pre>
                  </div>
                )}
                {newValues && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-ink">After</h4>
                    <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-soft">
                      {JSON.stringify(newValues, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!changes && !oldValues && !newValues && (
              <p className="rounded-lg border border-dashed border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">
                This entry has no payload — <LogValue value={selected.description} className="text-ink-soft" />
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
