'use client';

/**
 * A channel's delivery log.
 *
 * The same table serves Email, SMS and WhatsApp: every attempt the platform
 * made, with its template, provider, status, error and a preview of the payload.
 * Failures are what this screen exists for — the statistics strip puts the
 * seven-day failure count next to the volume so a broken credential shows up
 * before a user complains, and the failures panel repeats the last errors in
 * full.
 */
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useList } from '@/lib/utils/use-list';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';

interface DeliveryRow {
  id: number;
  recipient: string;
  subject: string | null;
  template_code: string | null;
  status: string;
  provider: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  segments?: number;
}

interface DeliveryStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  skipped: number;
  last7: number;
  failed7: number;
  lastAttempt: string | null;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'slate'> = {
  sent: 'success',
  failed: 'danger',
  queued: 'warning',
  skipped: 'slate',
};

export function DeliveryLogTable({ channel }: { channel: 'email' | 'sms' | 'whatsapp' }) {
  const list = useList<DeliveryRow>({
    endpoint: `/api/admin/settings/logs/${channel}`,
    initialFilters: { search: '', status: 'all', template_code: 'all', from_date: '', to_date: '' },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const stats = list.extra.stats as DeliveryStats | undefined;
  const templates = (list.extra.templates as { template_code: string; total: number }[] | undefined) ?? [];
  const failures = (list.extra.failures as { id: number; recipient: string; error_message: string | null; created_at: string }[] | undefined) ?? [];

  const providerLabel = channel === 'email' ? 'SMTP' : channel === 'sms' ? 'SMS provider' : 'WhatsApp provider';

  function exportCsv() {
    downloadCsv(
      `complianceos-${channel}-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Recipient', 'Template', 'Subject', 'Status', 'Provider', 'Sent at', 'Error'],
      list.data.map((row) => [
        row.recipient, row.template_code ?? '', row.subject ?? '', row.status,
        row.provider ?? '', row.sent_at ?? '', row.error_message ?? '',
      ])
    );
  }

  const columns: Column<DeliveryRow>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row) => (
        <div>
          <p className="text-sm text-ink">{row.recipient}</p>
          <p className="text-[11px] text-ink-muted">{formatDateTime(row.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'template_code',
      header: 'Template',
      hideOnMobile: true,
      render: (row) => row.template_code
        ? <span className="font-mono text-[12px] text-ink-soft">{row.template_code}</span>
        : <span className="text-[13px] text-ink-muted">—</span>,
    },
    {
      key: 'subject',
      header: channel === 'email' ? 'Subject' : 'Message',
      hideOnMobile: true,
      render: (row) => (
        <span className="line-clamp-2 max-w-[380px] text-[13px] text-ink-soft">{row.subject ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[row.status] ?? 'slate'} dot>{row.status}</Badge>
          {channel === 'sms' && row.segments ? <span className="text-[11px] text-ink-muted">{row.segments} seg</span> : null}
        </div>
      ),
    },
    {
      key: 'provider',
      header: providerLabel,
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-muted">{row.provider ?? '—'}</span>,
    },
    {
      key: 'error_message',
      header: 'Error',
      hideOnMobile: true,
      render: (row) =>
        row.error_message ? (
          <span className="line-clamp-2 max-w-[280px] text-[12px] text-red-600">{row.error_message}</span>
        ) : (
          <span className="text-[13px] text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Attempts" value={formatNumber(stats?.total ?? 0)} tone="brand" hint={stats?.lastAttempt ? `Latest ${formatDateTime(stats.lastAttempt)}` : 'Nothing sent yet'} />
        <StatCard label="Delivered" value={formatNumber(stats?.sent ?? 0)} tone="emerald" hint={`${formatNumber(stats?.last7 ?? 0)} in the last 7 days`} />
        <StatCard label="Failed" value={formatNumber(stats?.failed ?? 0)} tone="red" hint={`${formatNumber(stats?.failed7 ?? 0)} in the last 7 days`} />
        <StatCard label="Templates used" value={formatNumber(templates.length)} tone="violet" />
      </div>

      {failures.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Recent failures</h3>
            <div className="space-y-2">
              {failures.map((failure) => (
                <div key={failure.id} className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
                  <p className="text-[13px] text-ink">{failure.recipient} · {formatDateTime(failure.created_at)}</p>
                  <p className="mt-0.5 text-[12px] text-red-700">{failure.error_message ?? 'No error detail recorded'}</p>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink-muted">
              A failure here means the provider rejected the message. Check the credentials on this screen, then run the test button.
            </p>
          </CardBody>
        </Card>
      )}

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search recipient or template' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [
                { value: 'all', label: 'Every status' },
                { value: 'sent', label: 'Sent' },
                { value: 'failed', label: 'Failed' },
                { value: 'queued', label: 'Queued' },
                { value: 'skipped', label: 'Skipped' },
              ],
            },
            {
              key: 'template_code', type: 'select', label: 'Template',
              options: [{ value: 'all', label: 'Every template' }, ...templates.map((template) => ({
                value: template.template_code,
                label: `${template.template_code} (${template.total})`,
              }))],
            },
            { key: 'from_date', type: 'date', label: 'From' },
            { key: 'to_date', type: 'date', label: 'To' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-[13px] text-ink-muted">
            Every message the platform attempted, newest first. Failures carry the provider's own error text.
          </p>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.data.length}>Export CSV</Button>
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="Nothing has been sent on this channel yet"
          emptySubtitle="Save the credentials, then use the test button to send the first message."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>
    </div>
  );
}
