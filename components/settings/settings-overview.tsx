'use client';

/**
 * Settings overview (the System Settings screen's header).
 *
 * Shows how much of every group is configured, what the integration transports
 * are doing, and how the platform itself is holding up — database size, table
 * count, the settings rows that exist and the ones marked secret. Each group is
 * a card that links to its own screen.
 */
import Link from 'next/link';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';

export interface SettingsGroupSummary {
  group: string;
  label: string;
  fields: number;
  configured: number;
  secrets: number;
  secretsSet: number;
  lastUpdated: string | null;
  complete: boolean;
}

export interface SettingsOverviewProps {
  stats: {
    total: number;
    secrets: number;
    publicSettings: number;
    groups: number;
    lastUpdated: string | null;
    tables: number;
    sizeMb: number;
  };
  groups: SettingsGroupSummary[];
  screens: { group: string; href: string; title: string; description: string }[];
  integrations: {
    email: { configured: boolean; enabled: boolean; detail: string };
    sms: { configured: boolean; enabled: boolean; detail: string };
    whatsapp: { configured: boolean; enabled: boolean; detail: string };
    templates: { email: number; sms: number; whatsapp: number; inApp: number };
  };
  unknownGroups: string[];
}

export function SettingsOverview({ stats, groups, screens, integrations, unknownGroups }: SettingsOverviewProps) {
  const configured = groups.reduce((total, group) => total + group.configured, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Settings stored" value={formatNumber(stats.total)} tone="brand" hint={`${stats.groups} group(s)`} />
        <StatCard label="Configured" value={`${configured}`} tone="emerald" hint="Values that are actually set" />
        <StatCard label="Encrypted secrets" value={formatNumber(stats.secrets)} tone="violet" hint="AES-256-GCM at rest" />
        <StatCard label="Public values" value={formatNumber(stats.publicSettings)} tone="amber" hint="Readable by the public site" />
        <StatCard label="Database" value={`${stats.sizeMb} MB`} tone="slate" hint={`${stats.tables} tables`} />
        <StatCard
          label="Last change"
          value={stats.lastUpdated ? formatDateTime(stats.lastUpdated).split(',')[0] : '—'}
          tone="brand"
          hint="Any settings group"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {screens.map((screen) => {
          const summary = groups.find((group) => group.group === screen.group);
          return (
            <Link key={screen.group} href={screen.href} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink group-hover:text-brand-600">{screen.title}</h3>
                    {summary && (
                      <Badge tone={summary.complete ? 'success' : 'warning'} dot>
                        {summary.configured}/{summary.fields}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[13px] text-ink-muted">{screen.description}</p>
                  {summary && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${summary.complete ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.round((summary.configured / Math.max(summary.fields, 1)) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        {summary.secretsSet}/{summary.secrets} secret(s) set
                        {summary.lastUpdated ? ` · updated ${formatDateTime(summary.lastUpdated)}` : ''}
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Integration transports</h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              What each channel is actually using right now. A channel without credentials still logs every attempt, so
              nothing is lost — it is simply marked simulated.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ['Email', integrations.email, integrations.templates.email, '/admin/settings/email-settings'],
              ['SMS', integrations.sms, integrations.templates.sms, '/admin/settings/sms-settings'],
              ['WhatsApp', integrations.whatsapp, integrations.templates.whatsapp, '/admin/settings/whatsapp-settings'],
            ] as const).map(([label, state, templateCount, href]) => (
              <div key={label} className="rounded-lg border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <Badge tone={state.configured ? 'success' : 'warning'} dot>
                    {state.configured ? 'Ready' : 'Simulated'}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-ink-muted">{state.detail}</p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {templateCount} template(s) · {state.enabled ? 'switched on' : 'switched off'}
                </p>
                <Link href={href} className="mt-2 inline-block text-[12px] text-brand-600 hover:underline">
                  Configure →
                </Link>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-ink-muted">
            Notification templates in use: {integrations.templates.email} email, {integrations.templates.sms} SMS,{' '}
            {integrations.templates.whatsapp} WhatsApp and {integrations.templates.inApp} in-app.
          </p>
        </CardBody>
      </Card>

      {unknownGroups.length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Uncatalogued setting groups</h3>
            <p className="text-[13px] text-ink-muted">
              These groups exist in the <span className="font-mono">settings</span> table but are not described by the
              catalogue, so no screen edits them:{' '}
              <span className="font-mono">{unknownGroups.join(', ')}</span>. They are listed here so a stray row is
              visible rather than invisible.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
