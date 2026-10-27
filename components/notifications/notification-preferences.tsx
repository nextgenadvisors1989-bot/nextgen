'use client';

/**
 * The preferences grid: one row per notification category, one column per channel.
 *
 * An in-app notification is always recorded on the register; email, SMS and
 * WhatsApp are sent out to the person's own contact details, so the screen says
 * which is which rather than presenting four identical switches.
 */
import { useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';

interface PreferenceRow {
  category: string;
  label: string;
  description: string;
  in_app: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

interface PreferenceResponse {
  preferences: PreferenceRow[];
  saved: boolean;
  stats: { total: number; unread: number; categories: number; muted: number };
}

const CHANNELS: { key: 'in_app' | 'email' | 'sms' | 'whatsapp'; label: string }[] = [
  { key: 'in_app', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export function NotificationPreferences() {
  const toast = useToast();
  const [rows, setRows] = useState<PreferenceRow[]>([]);
  const [stats, setStats] = useState<PreferenceResponse['stats'] | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<PreferenceResponse>('/api/notifications/preferences');
        setRows(response.data?.preferences ?? []);
        setStats(response.data?.stats ?? null);
        setSaved(Boolean(response.data?.saved));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Preferences could not be loaded');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(category: string, channel: 'in_app' | 'email' | 'sms' | 'whatsapp', value: boolean) {
    setRows((current) => current.map((row) => (row.category === category ? { ...row, [channel]: value } : row)));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch<{ saved: number }>('/api/notifications/preferences', {
        preferences: rows.map((row) => ({
          category: row.category, in_app: row.in_app, email: row.email, sms: row.sms, whatsapp: row.whatsapp,
        })),
      });
      toast.success('Notification preferences saved');
      setDirty(false);
      setSaved(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!rows.length) return <EmptyState title="No notification categories to configure" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread now" value={formatNumber(Number(stats?.unread ?? 0))} tone={Number(stats?.unread ?? 0) ? 'amber' : 'slate'} />
        <StatCard label="Categories" value={formatNumber(rows.length)} tone="brand" />
        <StatCard label="Fully muted" value={formatNumber(rows.filter((row) => !row.in_app && !row.email && !row.sms && !row.whatsapp).length)} tone="slate" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Notification preferences"
            description={saved
              ? 'Your saved choices. In-app items always appear on the register; the other channels are sent out.'
              : 'Nothing saved yet — these are the platform defaults.'}
            action={<Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save preferences' : 'Saved'}</Button>}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Category</th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} className="w-24 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category} className="border-b border-line last:border-0">
                  <td className="px-6 py-4">
                    <p className="font-medium text-ink">{row.label}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{row.description}</p>
                  </td>
                  {CHANNELS.map((channel) => (
                    <td key={channel.key} className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={Boolean(row[channel.key])}
                          onChange={(checked) => toggle(row.category, channel.key, checked)}
                          aria-label={`${row.label} — ${channel.label}`}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
