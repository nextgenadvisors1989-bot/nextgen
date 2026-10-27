'use client';

/**
 * Admin > Audit Trails.
 *
 * The field-level history: one row per changed column, written by
 * `writeAuditTrail` for compliance-critical tables. Filters let an auditor trace
 * a single column over time ("who touched `aadhaar_number` this quarter") or
 * everything that happened to one record.
 */
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useList } from '@/lib/utils/use-list';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { TRAIL_OPERATIONS } from '@/lib/validations/audit-log.validation';
import { LogStats, LogValue, OperationBadge } from '@/components/logs/shared';

interface TrailRow {
  id: number;
  table_name: string;
  record_id: number;
  operation: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: number | null;
  changed_by_name: string | null;
  ip_address: string | null;
  reason: string | null;
  created_at: string;
}

interface Option {
  value: string;
  label: string;
}

export function AuditTrailsTable({ canExport }: { canExport: boolean }) {
  const list = useList<TrailRow>({
    endpoint: '/api/admin/audit-trails',
    initialFilters: {
      search: '', table_name: 'all', operation: 'all', field_name: 'all', changed_by: 'all',
      record_id: '', changedOnly: '1', from_date: '', to_date: '',
    },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const stats = list.extra.stats as Record<string, number> | undefined;
  const facets = (list.extra.facets as {
    tables?: Option[]; fields?: Option[]; operations?: Option[];
    actors?: { id: number; name: string; total: number }[];
  } | undefined) ?? {};

  const columns: Column<TrailRow>[] = [
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
      key: 'record',
      header: 'Record',
      render: (row) => (
        <span className="text-ink-soft">
          <span className="font-medium text-ink">{row.table_name}</span>
          <span className="block text-xs text-ink-muted">#{row.record_id}</span>
        </span>
      ),
    },
    {
      key: 'operation',
      header: 'Operation',
      render: (row) => <OperationBadge operation={row.operation} />,
    },
    {
      key: 'field',
      header: 'Field',
      render: (row) => row.field_name
        ? <span className="font-mono text-xs text-ink-soft">{row.field_name}</span>
        : <Badge tone="slate">whole record</Badge>,
    },
    {
      key: 'change',
      header: 'Change',
      render: (row) => (
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="text-red-700"><LogValue value={row.old_value} /></span>
          <span className="text-emerald-700"><LogValue value={row.new_value} /></span>
        </span>
      ),
    },
    {
      key: 'who',
      header: 'Changed by',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.changed_by_name ?? 'System'}
          {row.reason ? <span className="block text-xs text-ink-muted">{truncate(row.reason, 32)}</span> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <LogStats
        items={[
          { label: 'Field changes recorded', value: formatNumber(stats?.total ?? list.pagination.total), hint: `${formatNumber(stats?.today ?? 0)} today`, tone: 'brand' },
          { label: 'Records touched', value: formatNumber(stats?.records ?? 0), hint: `Across ${formatNumber(stats?.tables ?? 0)} tables`, tone: 'slate' },
          { label: 'Updates', value: formatNumber(stats?.updates ?? 0), hint: `${formatNumber(stats?.inserts ?? 0)} inserts · ${formatNumber(stats?.deletes ?? 0)} deletes`, tone: 'violet' },
          { label: 'Soft deletes & restores', value: formatNumber((stats?.softDeletes ?? 0) + (stats?.restores ?? 0)), hint: `${formatNumber(stats?.softDeletes ?? 0)} archived · ${formatNumber(stats?.restores ?? 0)} restored`, tone: 'amber' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search table, field, user, reason or value…' },
            { key: 'table_name', type: 'select', label: 'Table', options: [{ value: 'all', label: 'All tables' }, ...(facets.tables ?? [])] },
            { key: 'operation', type: 'select', label: 'Operation', options: [{ value: 'all', label: 'All operations' }, ...TRAIL_OPERATIONS.map((value) => ({ value, label: value.replace('_', ' ') }))] },
            { key: 'field_name', type: 'select', label: 'Field', options: [{ value: 'all', label: 'All fields' }, ...(facets.fields ?? [])] },
            {
              key: 'changed_by', type: 'select', label: 'Changed by',
              options: [
                { value: 'all', label: 'Anyone' },
                ...(facets.actors ?? []).map((actor) => ({ value: String(actor.id), label: `${actor.name} (${actor.total})` })),
              ],
            },
            { key: 'record_id', type: 'search', label: 'Record id', placeholder: 'e.g. 42' },
            {
              key: 'changedOnly', type: 'select', label: 'Depth',
              options: [
                { value: '1', label: 'Field changes only' },
                { value: '0', label: 'Include record-level entries' },
              ],
            },
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
                  `audit-trails-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['When', 'Table', 'Record id', 'Operation', 'Field', 'Old value', 'New value', 'Changed by', 'Reason', 'IP'],
                  list.data.map((row) => [
                    row.created_at, row.table_name, row.record_id, row.operation, row.field_name,
                    row.old_value, row.new_value, row.changed_by_name, row.reason, row.ip_address,
                  ])
                )}
              >
                Export CSV
              </Button>
            ) : undefined
          }
        />

        <DataTable<TrailRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No field changes recorded"
          emptySubtitle="The audit trail fills as records are created, edited, archived and restored."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}
    </div>
  );
}
