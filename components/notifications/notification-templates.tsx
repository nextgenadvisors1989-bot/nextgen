'use client';

/**
 * The administrator's template register: the wording the platform sends for every
 * event, with the shipped text kept beside any customisation so an edited template
 * can always be put back.
 *
 * A template's variables are load-bearing — the orchestrator fills them in when it
 * sends — so the editor refuses a body that drops one and names what is missing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatNumber } from '@/lib/utils/formatting';
import { formatDateTime } from '@/lib/utils/dates';

interface TemplateRow {
  template_code: string;
  template_name: string;
  channel: string;
  category: string;
  locale: string;
  variables: string[];
  subject: string | null;
  body: string | null;
  shipped_subject: string | null;
  shipped_body: string | null;
  is_active: number;
  customised: boolean;
  updated_at: string | null;
}

export function NotificationTemplates() {
  const toast = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string }>({ subject: '', body: '' });

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (channel && channel !== 'all') query.set('channel', channel);
      const response = await api.get<TemplateRow[]>(`/api/admin/notifications/templates?${query.toString()}`);
      const raw = response.raw as { stats?: Record<string, unknown> } | undefined;
      setRows(response.data ?? []);
      setStats(raw?.stats ?? {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Templates could not be loaded');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [search, channel]);

  const selected = useMemo(
    () => rows.find((row) => row.template_code === selectedCode) ?? rows[0] ?? null,
    [rows, selectedCode]
  );

  useEffect(() => {
    if (selected) setDraft({ subject: selected.subject ?? '', body: selected.body ?? '' });
  }, [selected?.template_code, selected?.channel, rows.length]);

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await api.put<{ customised: boolean }>('/api/admin/notifications/templates', {
        template_code: selected.template_code,
        channel: selected.channel,
        locale: selected.locale,
        subject: draft.subject,
        body: draft.body,
      });
      if (!response.ok) { toast.error(response.message); return; }
      toast.success(`${selected.template_name} saved`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.delete('/api/admin/notifications/templates', {
        body: { template_code: selected.template_code, channel: selected.channel, locale: selected.locale },
      });
      toast.success('Shipped wording restored');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be restored');
    } finally {
      setBusy(false);
    }
  }

  const customised = rows.filter((row) => row.customised);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Templates" value={formatNumber(rows.length)} tone="brand" />
        <StatCard label="Customised" value={formatNumber(customised.length)} tone={customised.length ? 'amber' : 'slate'} />
        <StatCard label="Channels" value={formatNumber(Number((stats.channels as unknown[] | undefined)?.length ?? 0))} tone="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card padded={false}>
          <div className="space-y-3 border-b border-line px-4 py-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates…" aria-label="Search templates" />
            <Select
              value={channel}
              onChange={(value) => setChannel(value)}
              options={[
                { value: 'all', label: 'All channels' },
                { value: 'email', label: 'Email' },
                { value: 'sms', label: 'SMS' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'in_app', label: 'In-app' },
              ]}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : rows.length === 0 ? (
            <EmptyState compact title="No templates match" subtitle="Try a different search or channel." />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li key={`${row.template_code}-${row.channel}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedCode(row.template_code)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-surface-muted ${selected?.template_code === row.template_code ? 'bg-brand-50/60' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{row.template_name}</span>
                      {row.customised ? <Badge tone="warning">edited</Badge> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                      <span>{row.channel}</span><span>·</span><span>{row.template_code}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card padded={false}>
            <div className="px-4 pt-4">
              <CardHeader
                title={selected.template_name}
                description={`${selected.channel} · ${selected.template_code} · ${selected.locale}${selected.updated_at ? ` · last edited ${formatDateTime(selected.updated_at)}` : ''}`}
                action={
                  <div className="flex items-center gap-2">
                    {selected.customised ? <Button variant="outline" size="sm" onClick={restore} disabled={busy}>Restore shipped</Button> : null}
                    <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
                  </div>
                }
              />
            </div>

            <div className="space-y-4 p-6">
              {selected.variables?.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Variables</span>
                  {selected.variables.map((name) => <Badge key={name} tone="slate">{`{{${name}}}`}</Badge>)}
                </div>
              ) : null}

              {selected.channel === 'email' ? (
                <Input label="Subject" value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} />
              ) : null}

              <Textarea
                label={selected.channel === 'email' ? 'HTML body' : 'Message'}
                rows={selected.channel === 'email' ? 16 : 5}
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                className="font-mono text-[13px]"
              />

              {selected.shipped_body ? (
                <details className="rounded-lg border border-line bg-surface-muted p-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink-soft">Shipped wording</summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ink-muted">{selected.shipped_body}</pre>
                </details>
              ) : null}
            </div>
          </Card>
        ) : (
          <EmptyState title="Choose a template" subtitle="Pick one from the register to read or edit its wording." />
        )}
      </div>
    </div>
  );
}
