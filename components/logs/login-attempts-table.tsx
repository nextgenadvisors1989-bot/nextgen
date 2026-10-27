'use client';

/**
 * Admin > Login Attempts.
 *
 * Authentication as a security view: every sign-in with its outcome, the reason
 * a failure was refused, the address it came from, and a short list of
 * addresses with repeated failures — the signal that turns a log into an alert.
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
import { LogStats } from '@/components/logs/shared';

interface AttemptRow {
  id: number;
  email: string;
  user_id: number | null;
  success: number | boolean;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  attempted_at: string;
  user_name?: string | null;
  user_status?: string | null;
}

interface Option {
  value: string;
  label: string;
}

export function LoginAttemptsTable({ canExport }: { canExport: boolean }) {
  const list = useList<AttemptRow>({
    endpoint: '/api/admin/login-attempts',
    initialFilters: {
      search: '', success: 'all', failure_reason: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'attempted_at',
    initialSortDir: 'desc',
  });

  const stats = list.extra.stats as Record<string, number> | undefined;
  const reasons = (list.extra.reasons as { reason: string; total: number }[] | undefined) ?? [];
  const suspicious = (list.extra.suspicious as {
    ip: string; attempts: number; failures: number; emails: number; lastSeen: string;
  }[] | undefined) ?? [];

  const failureOptions: Option[] = reasons.map((row) => ({
    value: row.reason,
    label: `${row.reason} (${formatNumber(row.total)})`,
  }));

  const columns: Column<AttemptRow>[] = [
    {
      key: 'when',
      header: 'When',
      width: 170,
      render: (row) => <span className="text-ink-soft">{formatDateTime(row.attempted_at)}</span>,
    },
    {
      key: 'who',
      header: 'Attempted account',
      render: (row) => (
        <span className="text-ink-soft">
          <span className="font-medium text-ink">{row.email}</span>
          {row.user_name?.trim() ? (
            <span className="block text-xs text-ink-muted">{row.user_name.trim()}</span>
          ) : (
            <span className="block text-xs text-ink-muted">No matching user</span>
          )}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) => (Number(row.success) ? (
        <Badge tone="success" dot>Signed in</Badge>
      ) : (
        <span className="flex flex-col items-start gap-1">
          <Badge tone="danger" dot>Refused</Badge>
          {row.failure_reason ? <span className="text-xs text-ink-muted">{row.failure_reason}</span> : null}
        </span>
      )),
    },
    {
      key: 'address',
      header: 'Address',
      render: (row) => <span className="font-mono text-xs text-ink-soft">{row.ip_address ?? '—'}</span>,
    },
    {
      key: 'agent',
      header: 'Client',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-ink-muted">{truncate(row.user_agent ?? '—', 48)}</span>,
    },
    {
      key: 'account',
      header: 'Account state',
      hideOnMobile: true,
      render: (row) => (row.user_id
        ? <Badge tone={row.user_status === 'active' ? 'success' : 'warning'}>#{row.user_id} · {row.user_status ?? 'unknown'}</Badge>
        : <span className="text-ink-muted">—</span>),
    },
  ];

  return (
    <div className="space-y-5">
      <LogStats
        items={[
          { label: 'Sign-in attempts', value: formatNumber(stats?.total ?? list.pagination.total), hint: `${formatNumber(stats?.today ?? 0)} today`, tone: 'brand' },
          { label: 'Signed in', value: formatNumber(stats?.succeeded ?? 0), hint: `${formatNumber(stats?.emails ?? 0)} distinct accounts`, tone: 'emerald' },
          { label: 'Refused', value: formatNumber(stats?.failed ?? 0), hint: `${formatNumber(stats?.failedLast24 ?? 0)} in the last 24 hours`, tone: 'red' },
          { label: 'Source addresses', value: formatNumber(stats?.ips ?? 0), hint: 'Distinct client IPs seen', tone: 'slate' },
        ]}
      />

      {suspicious.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Addresses with repeated failures</h3>
            <p className="text-xs text-ink-muted">Three or more refused sign-ins from one address — worth a look.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {suspicious.map((row) => (
              <button
                key={row.ip}
                type="button"
                onClick={() => list.setFilter('search', row.ip)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm hover:border-red-300"
              >
                <span className="font-mono text-xs text-ink">{row.ip}</span>
                <Badge tone="danger">{formatNumber(row.failures)} refused</Badge>
                <span className="text-xs text-ink-muted">{formatNumber(row.emails)} account(s) · last {formatDateTime(row.lastSeen)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search email, IP address, client or reason…' },
            {
              key: 'success', type: 'select', label: 'Outcome',
              options: [
                { value: 'all', label: 'Any outcome' },
                { value: 'true', label: 'Signed in' },
                { value: 'false', label: 'Refused' },
              ],
            },
            { key: 'failure_reason', type: 'select', label: 'Failure reason', options: [{ value: 'all', label: 'Any reason' }, ...failureOptions] },
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
                  `login-attempts-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Attempted at', 'Account', 'User', 'Outcome', 'Failure reason', 'IP address', 'User agent'],
                  list.data.map((row) => [
                    row.attempted_at, row.email, row.user_name ?? '', Number(row.success) ? 'Signed in' : 'Refused',
                    row.failure_reason, row.ip_address, row.user_agent,
                  ])
                )}
              >
                Export CSV
              </Button>
            ) : undefined
          }
        />

        <DataTable<AttemptRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No sign-in attempts recorded"
          emptySubtitle="Every login, successful or refused, is written here with its address and client."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}
    </div>
  );
}
