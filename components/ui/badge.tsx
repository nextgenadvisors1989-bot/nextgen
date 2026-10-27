import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeTone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'slate';

const TONES: Record<BadgeTone, string> = {
  default: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-indigo-100 text-indigo-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
};

export function Badge({ children, tone = 'default', className, dot }: { children: ReactNode; tone?: BadgeTone; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success', inactive: 'slate', suspended: 'warning', resigned: 'info', terminated: 'danger',
  Approved: 'success', Rejected: 'danger', Submitted: 'info', 'Under Review': 'violet',
  'Changes Requested': 'warning', 'Not Started': 'slate', 'In Progress': 'brand', 'Draft Saved': 'warning',
  Overdue: 'danger', Cancelled: 'slate', Draft: 'slate', Calculated: 'brand', Locked: 'violet',
  Paid: 'success', Pending: 'warning', Failed: 'danger', Valid: 'success', 'Expiring Soon': 'warning',
  Expired: 'danger', 'Applied for Renewal': 'brand', Open: 'warning', Closed: 'slate', published: 'success',
  draft: 'slate', archived: 'slate', Low: 'slate', Medium: 'brand', High: 'warning', Urgent: 'danger',
  Extreme: 'danger', pending: 'warning', completed: 'success', in_review: 'violet',
};

/** Maps any domain status string to a consistent colour. */
export function StatusBadge({ status, className, dot = true }: { status: string | null | undefined; className?: string; dot?: boolean }) {
  const label = status ?? '—';
  return (
    <Badge tone={STATUS_TONE[label] ?? 'default'} className={className} dot={dot}>
      {label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  return <StatusBadge status={priority ?? 'Medium'} />;
}
