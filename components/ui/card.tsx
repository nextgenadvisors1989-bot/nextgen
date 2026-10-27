import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={clsx('card', padded && 'card-pad', className)}>{children}</div>;
}

export function CardHeader({ title, description, action, className }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-4 sm:px-6', className)}>
      <div className="min-w-0">
        <h3 className="section-title">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('px-4 py-5 sm:px-6', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('border-t border-line bg-surface-muted px-4 py-4 sm:px-6', className)}>{children}</div>;
}

/** Compact metric tile used across every dashboard. */
export function StatCard({ label, value, hint, icon, tone = 'brand', trend }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate';
  trend?: { value: string; positive: boolean };
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="card animate-fade-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
          {trend && (
            <p className={clsx('mt-1 text-xs font-medium', trend.positive ? 'text-emerald-600' : 'text-red-600')}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </p>
          )}
        </div>
        {icon && <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>}
      </div>
    </div>
  );
}
