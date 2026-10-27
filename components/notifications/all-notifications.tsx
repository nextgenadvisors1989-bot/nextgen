'use client';

/**
 * The notification register: everything the platform has told this account,
 * newest first, with the unread ones called out and a filter for them.
 *
 * Reads `/api/notifications`, which is scoped to the signed-in user server-side —
 * there is no user id in the request and no way to read somebody else's list.
 */
import Link from 'next/link';
import { useState } from 'react';
import clsx from 'clsx';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Filters } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { timeAgo } from '@/lib/utils/dates';

interface NotificationRow {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  category: string;
  priority: string;
  action_url: string | null;
  action_label: string | null;
  is_read: 0 | 1;
  read_at: string | null;
  created_at: string;
}

const TYPE_TONES: Record<string, 'brand' | 'success' | 'warning' | 'danger' | 'slate'> = {
  info: 'brand',
  success: 'success',
  warning: 'warning',
  error: 'danger',
  action_required: 'warning',
};

const CATEGORIES = [
  { value: 'ACCOUNT', label: 'Account' },
  { value: 'AUDIT', label: 'Audits' },
  { value: 'REPORT', label: 'Reports' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'PAYROLL', label: 'Payroll' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'EMPLOYEE', label: 'Employees' },
  { value: 'EMPLOYER', label: 'Establishment' },
  { value: 'REMINDER', label: 'Reminders' },
  { value: 'SYSTEM', label: 'System' },
];

export function AllNotifications({ heading = 'Notifications' }: { heading?: string }) {
  const toast = useToast();
  const list = useList<NotificationRow>({ endpoint: '/api/notifications', initialLimit: 25 });
  const [busy, setBusy] = useState(false);
  const unread = Number((list.extra.unreadCount as number | undefined) ?? 0);

  async function markRead(ids?: number[]) {
    setBusy(true);
    try {
      const response = await api.post<{ updated: number }>('/api/notifications/mark-read', { notification_ids: ids });
      const updated = response.data?.updated;
      toast.success(typeof updated === 'number' ? `${updated} notification(s) marked as read` : 'Notifications marked as read');
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread" value={unread} tone={unread ? 'amber' : 'slate'} />
        <StatCard label="On record" value={list.pagination.total} tone="brand" />
        <StatCard label="Showing" value={list.data.length} tone="slate" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title={heading}
            description="Everything the platform has told you, newest first."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => list.setFilter('unread_only', list.filters.unread_only === 'true' ? '' : 'true')}
                >
                  {list.filters.unread_only === 'true' ? 'Show all' : 'Unread only'}
                </Button>
                <Button size="sm" onClick={() => markRead()} disabled={busy || unread === 0}>Mark all read</Button>
              </div>
            }
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search notifications…' },
            { key: 'category', type: 'select', label: 'Category', options: CATEGORIES },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        {list.loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : list.error ? (
          <EmptyState title="The notifications could not be loaded" subtitle={list.error} />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="Nothing to read"
            subtitle={list.filters.unread_only === 'true'
              ? 'Everything has been read. Switch back to "Show all" to see the archive.'
              : 'Audits, compliance dates and payroll updates land here as they happen.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.map((row) => (
              <li key={row.id} className={clsx('flex items-start gap-4 px-6 py-4', row.is_read === 0 && 'bg-brand-50/40')}>
                <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', row.is_read === 0 ? 'bg-brand-500' : 'bg-slate-300')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={clsx('truncate text-sm', row.is_read === 0 ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
                      {row.title}
                    </p>
                    <Badge tone={TYPE_TONES[row.type] ?? 'slate'}>{row.category.replace(/_/g, ' ').toLowerCase()}</Badge>
                    {row.priority === 'urgent' || row.priority === 'high' ? <Badge tone="danger">{row.priority}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{row.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                    <span>{timeAgo(row.created_at)}</span>
                    {row.action_url ? (
                      <Link href={row.action_url} className="font-medium text-brand-600 hover:underline">
                        {row.action_label || 'Open'}
                      </Link>
                    ) : null}
                    {row.is_read === 0 ? (
                      <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => markRead([row.id])} disabled={busy}>
                        Mark as read
                      </button>
                    ) : (
                      <span className="text-ink-muted">Read {row.read_at ? timeAgo(row.read_at) : ''}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {list.data.length > 0 && (
          <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
        )}
      </Card>
    </div>
  );
}
