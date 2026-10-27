'use client';

/**
 * The compact half of the notification centre: the newest handful of items, the
 * unread count and a way through to the full register.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { timeAgo } from '@/lib/utils/dates';

interface NotificationRow {
  id: number;
  title: string;
  message: string;
  category: string;
  action_url: string | null;
  action_label: string | null;
  is_read: 0 | 1;
  created_at: string;
}

export function NotificationCentre({ heading = 'Notifications', limit = 8, basePath }: {
  heading?: string;
  limit?: number;
  basePath?: string;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get<NotificationRow[]>(`/api/notifications?limit=${limit}`);
      const raw = response.raw as { unreadCount?: number } | undefined;
      setRows(response.data ?? []);
      setUnread(Number(raw?.unreadCount ?? 0));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [limit]);

  async function markRead(ids?: number[]) {
    setBusy(true);
    try {
      await api.post('/api/notifications/mark-read', { notification_ids: ids });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">{heading}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{unread > 0 ? `${unread} unread` : 'Nothing unread'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => markRead()} disabled={busy || unread === 0}>Mark all read</Button>
          {basePath ? <LinkButton href={`${basePath}/notifications`} variant="outline" size="sm">Open register</LinkButton> : null}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState compact title="No notifications yet" subtitle="Audits, documents and payroll updates land here." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => (
            <li key={row.id} className={clsx('flex items-start gap-3 px-4 py-3', row.is_read === 0 && 'bg-brand-50/40')}>
              <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', row.is_read === 0 ? 'bg-brand-500' : 'bg-slate-300')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={clsx('truncate text-sm', row.is_read === 0 ? 'font-semibold text-ink' : 'text-ink-soft')}>{row.title}</p>
                  <Badge tone="slate">{row.category.replace(/_/g, ' ').toLowerCase()}</Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{row.message}</p>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-ink-muted">
                  <span>{timeAgo(row.created_at)}</span>
                  {row.action_url ? (
                    <Link href={row.action_url} className="font-medium text-brand-600 hover:underline">{row.action_label || 'Open'}</Link>
                  ) : null}
                  {row.is_read === 0 ? (
                    <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => markRead([row.id])} disabled={busy}>
                      Mark as read
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
