'use client';

/**
 * Presentation pieces shared by the four log screens.
 *
 * They are deliberately dependency-free: badges read the vocabulary the loggers
 * write, and the activity trend is a hand-rolled SVG strip (deterministic, no
 * client-side chart hydration to go wrong on a screen operators open under
 * pressure).
 */
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/utils/formatting';

export type BadgeTone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'slate';

/** Actions map onto the same palette the rest of the platform uses. */
const ACTION_TONES: Record<string, BadgeTone> = {
  created: 'success', create: 'success', uploaded: 'success', restored: 'success', resolved: 'success',
  approved: 'success', verified: 'success', completed: 'success', login: 'info',
  updated: 'info', update: 'info', submitted: 'info', exported: 'info', downloaded: 'info', reviewed: 'info',
  archived: 'slate', logout: 'slate', deleted: 'danger', delete: 'danger', rejected: 'danger',
  failed: 'danger', reminded: 'warning', renewed: 'brand', returned: 'warning', reopened: 'warning',
  assigned: 'brand', started: 'brand',
};

export function ActionBadge({ action, value }: { action?: string | null; value?: string | null }) {
  const key = String(value ?? action ?? '').toLowerCase();
  return <Badge tone={ACTION_TONES[key] ?? 'default'}>{value ?? action ?? '—'}</Badge>;
}

const STATUS_TONES: Record<string, BadgeTone> = { success: 'success', failed: 'danger', warning: 'warning' };

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-ink-muted">—</span>;
  return <Badge tone={STATUS_TONES[status] ?? 'default'} dot>{status}</Badge>;
}

const SEVERITY_TONES: Record<string, BadgeTone> = {
  debug: 'slate', info: 'info', low: 'slate', medium: 'brand', warning: 'warning',
  high: 'warning', error: 'danger', critical: 'danger', fatal: 'danger',
};

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return <span className="text-ink-muted">—</span>;
  return <Badge tone={SEVERITY_TONES[severity] ?? 'default'}>{severity}</Badge>;
}

const OPERATION_TONES: Record<string, BadgeTone> = {
  INSERT: 'success', UPDATE: 'info', DELETE: 'danger', SOFT_DELETE: 'warning', RESTORE: 'success',
};

export function OperationBadge({ operation }: { operation: string | null | undefined }) {
  if (!operation) return <span className="text-ink-muted">—</span>;
  return (
    <Badge tone={OPERATION_TONES[String(operation).toUpperCase()] ?? 'default'}>
      {String(operation).replace('_', ' ')}
    </Badge>
  );
}

export function LogStats({
  items,
}: {
  items: { label: string; value: string | number; hint?: string; tone?: 'brand' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate' }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} tone={item.tone ?? 'brand'} />
      ))}
    </div>
  );
}

export interface TrendPoint {
  day: string;
  total: number;
  failed: number;
  creates?: number;
  updates?: number;
  deletes?: number;
}

/**
 * Fourteen (or more) days of activity as a bar strip: height is the day's total,
 * the red segment is the failures inside it, and the busiest day is labelled.
 */
export function ActivityTrend({ points, title = 'Activity over time' }: { points: TrendPoint[]; title?: string }) {
  if (!points.length) {
    return (
      <Card>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-ink-muted">No entries in this period.</p>
      </Card>
    );
  }

  const max = Math.max(...points.map((point) => point.total), 1);
  const peak = points.reduce((best, point) => (point.total > best.total ? point : best), points[0]);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted">
          Peak {formatNumber(peak.total)} on {peak.day} · failures in red
        </p>
      </div>

      <div className="mt-4 flex h-28 items-end gap-1">
        {points.map((point) => {
          const height = Math.max((point.total / max) * 100, point.total > 0 ? 4 : 0);
          const failedShare = point.total ? (point.failed / point.total) * 100 : 0;
          return (
            <div
              key={point.day}
              className="group relative flex flex-1 flex-col justify-end"
              title={`${point.day}: ${point.total} action(s), ${point.failed} failed`}
            >
              <div
                className="w-full overflow-hidden rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600"
                style={{ height: `${height}%` }}
              >
                {failedShare > 0 && (
                  <div className="w-full bg-red-500" style={{ height: `${failedShare}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        <span>{points[0].day}</span>
        <span>{points[points.length - 1].day}</span>
      </div>
    </Card>
  );
}

/** A value from the log, rendered as text rather than as a raw object. */
export function LogValue({ value, className }: { value: unknown; className?: string }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-ink-muted">—</span>;
  }
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'object') {
    return <span className={`font-mono text-xs ${className ?? ''}`}>{JSON.stringify(value)}</span>;
  }
  return <span className={className}>{String(value)}</span>;
}

/**
 * The before/after table shown when a log entry carries a `changed_fields`
 * payload — the audit trail expressed the way an auditor reads it.
 */
export function ChangeTable({ changes }: { changes: Record<string, { from?: unknown; to?: unknown }> }) {
  const entries = Object.entries(changes);
  if (!entries.length) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[13px] font-semibold text-ink-soft">
          <tr>
            <th className="px-3 py-2 text-left">Field</th>
            <th className="px-3 py-2 text-left">Before</th>
            <th className="px-3 py-2 text-left">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {entries.map(([field, pair]) => (
            <tr key={field}>
              <td className="px-3 py-2 font-medium text-ink-soft">{field}</td>
              <td className="px-3 py-2 text-red-700">
                <LogValue value={pair?.from} />
              </td>
              <td className="px-3 py-2 text-emerald-700">
                <LogValue value={pair?.to} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Safe parse for the JSON columns the loggers store as text. */
export function parseJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return null;
  }
}
