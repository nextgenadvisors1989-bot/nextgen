'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { TableSkeleton } from './loader';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey: (row: T, index: number) => string | number;
  serialNumber?: boolean;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: ReactNode;
  footer?: ReactNode;
  stickyHeader?: boolean;
  dense?: boolean;
}

/**
 * The one table used across the whole platform: sticky header, serial column,
 * hover transitions, loading skeletons, empty state and mobile fallback.
 */
export function DataTable<T>({
  columns, data, loading, rowKey, serialNumber = true, onRowClick,
  emptyTitle, emptySubtitle, emptyAction, footer, stickyHeader, dense,
}: DataTableProps<T>) {
  const totalColumns = columns.length + (serialNumber ? 1 : 0);

  return (
    <>
    <div className="w-full overflow-x-auto">
      <table className="table-base min-w-full">
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr>
            {serialNumber && <th style={{ width: 48, minWidth: 48 }} className={clsx('table-head whitespace-nowrap px-2 text-center')}>#</th>}
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width }}
                className={clsx(
                  'table-head',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  column.hideOnMobile && 'hidden md:[display:table-cell]',
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        {loading ? (
          <TableSkeleton rows={6} columns={totalColumns} />
        ) : (
          <tbody>
            {data.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'bg-white transition-colors duration-150 ease-in-out hover:bg-surface-muted',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {serialNumber && (
                  <td className={clsx('table-cell whitespace-nowrap px-2 text-center text-ink-muted', dense && 'py-2')}>{index + 1}</td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      'table-cell',
                      dense && 'py-2',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right',
                      column.hideOnMobile && 'hidden md:[display:table-cell]',
                      column.className
                    )}
                  >
                    {column.render
                      ? column.render(row, index)
                      : String((row as Record<string, unknown>)[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>

      {!loading && data.length === 0 && (
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} action={emptyAction} compact />
      )}
    </div>
    {/* Outside the <table>: a pagination bar inside <tfoot> becomes a stray first-column cell and stretches it. */}
    {!loading && footer}
    </>
  );
}

/** Card-per-row rendering used automatically on small screens. */
export function MobileCardList<T>({ data, rowKey, renderCard }: {
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  renderCard: (row: T, index: number) => ReactNode;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {data.map((row, index) => (
        <div key={rowKey(row, index)} className="card p-4">
          {renderCard(row, index)}
        </div>
      ))}
    </div>
  );
}

/** Key/value description block used throughout detail pages. */
export function DetailRow({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0 sm:flex-row sm:items-start sm:gap-4', className)}>
      <span className="w-full shrink-0 text-[13px] font-medium text-ink-muted sm:w-56">{label}</span>
      <span className="text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}

export function DescriptionGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  const gridClass = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={clsx('grid grid-cols-1 gap-x-8', gridClass)}>{children}</div>;
}
