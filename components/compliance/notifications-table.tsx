'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats, type LookupOption } from '@/components/compliance/shared';
import { INSTRUMENT_STATUSES } from '@/lib/validations/compliance.validation';

interface NotificationRow {
  id: number;
  notification_number: string;
  title: string;
  notification_date: string | null;
  issuing_authority: string | null;
  act_id: number | null;
  act_name?: string | null;
  act_short_name?: string | null;
  gazette_reference: string | null;
  effective_date: string | null;
  applicability: string | null;
  action_required: string | null;
  status: string;
}

export function NotificationsTable({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<NotificationRow>({
    endpoint: '/api/admin/compliance/notifications',
    initialFilters: { search: '', act_id: 'all', status: 'all', from_date: '', to_date: '' },
    initialSortBy: 'notification_date',
  });
  const [pendingDelete, setPendingDelete] = useState<NotificationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const actOptions = (list.extra.actOptions as LookupOption[] | undefined) ?? [];
  const stats = list.extra.stats as Record<string, number> | undefined;

  const columns: Column<NotificationRow>[] = [
    {
      key: 'notification',
      header: 'Notification',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/notifications/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.title, 55)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.notification_number, row.act_short_name ?? row.act_name].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      key: 'dated',
      header: 'Dated',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.notification_date ? formatDate(row.notification_date) : '—'}
          {row.effective_date ? <span className="block text-xs text-ink-muted">effective {formatDate(row.effective_date)}</span> : null}
        </span>
      ),
    },
    {
      key: 'authority',
      header: 'Issued by',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.issuing_authority ?? '—', 32)}</span>,
    },
    {
      key: 'action',
      header: 'Action required',
      hideOnMobile: true,
      render: (row) => row.action_required
        ? <Badge tone="warning">Action</Badge>
        : <Badge tone="default">Informational</Badge>,
    },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/compliance/notifications/${row.id}`} className="btn-icon" title="View notification" aria-label={`View ${row.title}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <Link href={`/admin/compliance/notifications/${row.id}/edit`} className="btn-icon" title="Edit notification" aria-label={`Edit ${row.title}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove notification"
              aria-label={`Remove ${row.title}`} onClick={() => setPendingDelete(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/admin/compliance/notifications/${pendingDelete.id}`);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      success('Notification removed', `${pendingDelete.notification_number} was removed from the register.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not remove the notification', result.message);
    }
  }

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Gazette notifications', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Registered notifications', tone: 'brand' },
          { label: 'Action required', value: formatNumber(stats?.actionable ?? 0), hint: 'Carry a follow-up duty', tone: 'warning' },
          { label: 'Effective later', value: formatNumber(stats?.upcoming ?? 0), hint: 'Commence after today', tone: 'info' },
          { label: 'Last 90 days', value: formatNumber(stats?.recent ?? 0), hint: 'Recently notified', tone: 'success' },
        ]}
      />

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by number, title, subject or authority…' },
            {
              key: 'act_id', type: 'select', label: 'Act',
              options: [{ value: 'all', label: 'All acts' }, ...actOptions.map((option) => ({ value: option.value, label: option.label }))],
            },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...INSTRUMENT_STATUSES.map((value) => ({ value, label: value }))],
            },
            { key: 'from_date', type: 'date', label: 'Dated from' },
            { key: 'to_date', type: 'date', label: 'Dated to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `gazette-notifications-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Number', 'Title', 'Dated', 'Issued by', 'Act', 'Gazette reference', 'Effective from', 'Action required', 'Status'],
                  list.data.map((row) => [
                    row.notification_number, row.title, row.notification_date, row.issuing_authority, row.act_name,
                    row.gazette_reference, row.effective_date, row.action_required, row.status,
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/compliance/notifications/create" size="sm">Add Notification</LinkButton>}
            </div>
          }
        />

        <DataTable<NotificationRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No gazette notifications found"
          emptySubtitle="Adjust the filters, or register the notifications that change what employers must do."
          emptyAction={canCreate ? <LinkButton href="/admin/compliance/notifications/create" size="sm">Add Notification</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this notification?"
        message={pendingDelete ? `${pendingDelete.notification_number} — ${pendingDelete.title} will be removed from the register.` : ''}
        confirmLabel="Remove Notification"
        variant="danger"
      />
    </div>
  );
}
