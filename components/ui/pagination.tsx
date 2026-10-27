'use client';

import clsx from 'clsx';
import type { Pagination as PaginationMeta } from '@/types/api';
import { pageWindow } from '@/lib/utils/pagination';

export interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
  className?: string;
}

/** "Showing X to Y of Z entries" + windowed page buttons, spec'd colours. */
export function Pagination({ pagination, onPageChange, onLimitChange, limitOptions = [10, 25, 50, 100], className }: PaginationProps) {
  const { page, limit, total, totalPages, from, to } = pagination;
  const pages = pageWindow(page, totalPages);

  return (
    <div className={clsx('flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-ink-muted">
          Showing <span className="font-medium text-ink-soft">{from}</span> to{' '}
          <span className="font-medium text-ink-soft">{to}</span> of{' '}
          <span className="font-medium text-ink-soft">{total}</span> entries
        </p>
        {onLimitChange && (
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            Show
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="focus-ring h-8 rounded-md border border-line bg-white px-2 text-[13px] text-ink"
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={clsx(
            'inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition-colors',
            page <= 1 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-brand-500 text-white hover:bg-brand-600'
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Prev
        </button>

        <span className="hidden items-center gap-1 sm:flex">
          {pages.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`gap-${index}`} className="px-1.5 text-ink-muted">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? 'page' : undefined}
                className={clsx(
                  'h-8 min-w-8 rounded-md border px-2 text-[13px] font-medium transition-colors',
                  item === page
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-white text-ink-soft hover:bg-brand-50'
                )}
              >
                {item}
              </button>
            )
          )}
        </span>

        <span className="text-[13px] text-ink-muted sm:hidden">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={clsx(
            'inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition-colors',
            page >= totalPages ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-brand-500 text-white hover:bg-brand-600'
          )}
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </nav>
    </div>
  );
}
