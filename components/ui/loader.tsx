import clsx from 'clsx';

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full border-2 border-brand-500 border-t-transparent', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner size={36} />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** Skeleton table rows that match the real column structure while data loads. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="table-cell">
              <div className="skeleton h-4 rounded" style={{ width: colIndex === 0 ? '40%' : `${60 + (colIndex % 3) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card card-pad space-y-3">
      <div className="skeleton h-5 w-1/3 rounded" />
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton h-4 rounded" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  );
}
