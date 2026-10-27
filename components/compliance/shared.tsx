'use client';

/**
 * Shared pieces for the five compliance registers: the status→tone mapping the
 * tables and detail pages agree on, the stat strip above every list, the
 * activity feed on a record page, and the lookup loader the forms share.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

export type ComplianceTone = 'success' | 'warning' | 'danger' | 'default' | 'info';

/** One source of truth for how a compliance status reads. */
export function statusTone(value: string | null | undefined): ComplianceTone {
  switch (String(value ?? '').toLowerCase()) {
    case 'active':
    case 'valid':
    case 'approved':
      return 'success';
    case 'expiring soon':
    case 'applied for renewal':
    case 'published':
      return 'warning';
    case 'expired':
    case 'repealed':
    case 'superseded':
      return 'danger';
    case 'inactive':
    case 'draft':
    case 'not applicable':
      return 'default';
    default:
      return 'info';
  }
}

export function ComplianceBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-ink-muted">—</span>;
  const tone = statusTone(value);
  const dot = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'danger' ? 'bg-red-500' : undefined;
  return <Badge tone={tone} dot={Boolean(dot)}>{value}</Badge>;
}

/** Colour-coded day counter used across the register tables. */
export function DaysBadge({ days }: { days: number | null | undefined }) {
  if (days === null || days === undefined) return <span className="text-ink-muted">—</span>;
  const value = Number(days);
  if (value < 0) return <Badge tone="danger">{Math.abs(value)} days overdue</Badge>;
  if (value === 0) return <Badge tone="danger">due today</Badge>;
  if (value <= 15) return <Badge tone="danger">{value} days left</Badge>;
  if (value <= 45) return <Badge tone="warning">{value} days left</Badge>;
  return <span className="text-ink-soft">{value} days</span>;
}

export interface StatItem {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
}

const STAT_TONES: Record<string, 'brand' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate'> = {
  brand: 'brand', success: 'emerald', warning: 'amber', danger: 'red', info: 'violet',
};

export function ComplianceStats({ items, columns = 4 }: { items: StatItem[]; columns?: 3 | 4 | 5 | 6 }) {
  const grid = columns === 6 ? 'sm:grid-cols-3 lg:grid-cols-6'
    : columns === 5 ? 'sm:grid-cols-3 lg:grid-cols-5'
      : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 gap-4 ${grid}`}>
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={STAT_TONES[item.tone ?? 'brand'] ?? 'brand'}
        />
      ))}
    </div>
  );
}

/* ───────────────────────── register lookups (shared) ───────────────────── */

export interface LookupOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ComplianceLookups {
  employerOptions: LookupOption[];
  unitOptions: LookupOption[];
  actOptions: LookupOption[];
  ruleOptions: LookupOption[];
  documentTypes: string[];
  statuses: string[];
  defaultRemindDays: number;
}

/** Loads the pickers the forms need; `employerId` also pulls that company's units. */
export function useComplianceLookups(employerId?: string | number | null, actId?: string | number | null) {
  const [lookups, setLookups] = useState<ComplianceLookups | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams();
    if (employerId) query.set('employer_id', String(employerId));
    if (actId) query.set('act_id', String(actId));
    setLoading(true);
    api.get<ComplianceLookups>(`/api/admin/compliance/options${query.toString() ? `?${query}` : ''}`).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok && result.data) {
        setLookups({
          employerOptions: result.data.employerOptions ?? [],
          unitOptions: result.data.unitOptions ?? [],
          actOptions: result.data.actOptions ?? [],
          ruleOptions: result.data.ruleOptions ?? [],
          documentTypes: result.data.documentTypes ?? [],
          statuses: result.data.statuses ?? [],
          defaultRemindDays: result.data.defaultRemindDays ?? 30,
        });
      }
    });
    return () => { cancelled = true; };
  }, [employerId, actId]);

  return { lookups, loading };
}

/* ──────────────────────────── record activity ─────────────────────────── */

export interface ComplianceActivityRow {
  id: number;
  action: string;
  description: string | null;
  user_name: string | null;
  created_at: string;
}

/** The per-record trail: who touched this act, rule, regulation or document, and when. */
export function ComplianceActivity({ entityType, entityId, title = 'Activity' }: {
  entityType: string; entityId: number; title?: string;
}) {
  const [rows, setRows] = useState<ComplianceActivityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<ComplianceActivityRow[]>(
      `/api/admin/activity-logs?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}&limit=25`
    ).then((result) => {
      if (!cancelled && result.ok && result.data) setRows(result.data);
    });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {rows === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-ink">{row.description ?? row.action}</p>
                <p className="text-xs text-ink-muted">
                  {row.user_name ?? 'System'} · {formatDateTime(row.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A label/value row used on every detail page. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted sm:text-sm sm:font-medium sm:normal-case sm:tracking-normal">
        {label}
      </dt>
      <dd className="text-sm text-ink sm:col-span-2">{children}</dd>
    </div>
  );
}

export function Prose({ children }: { children: string | null | undefined }) {
  if (!children) return <span className="text-ink-muted">—</span>;
  return <p className="whitespace-pre-line leading-relaxed text-ink-soft">{children}</p>;
}
