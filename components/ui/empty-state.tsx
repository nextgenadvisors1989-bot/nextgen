import type { ReactNode } from 'react';

export function EmptyState({ title = 'No data found', subtitle = 'Try adjusting your filters or search criteria', action, illustration, compact }: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  illustration?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'}`}>
      <div className="mb-4 text-slate-300">
        {illustration ?? (
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden>
            <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="2" />
            <path d="M35 50h50M35 62h34M35 74h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="92" cy="86" r="16" fill="#f1f5f9" stroke="currentColor" strokeWidth="2" />
            <path d="m104 98 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
