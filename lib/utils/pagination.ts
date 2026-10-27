import type { Pagination } from '@/types/api';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export function parsePagination(searchParams: URLSearchParams | Record<string, unknown>): {
  page: number;
  limit: number;
  offset: number;
} {
  const get = (key: string) =>
    searchParams instanceof URLSearchParams ? searchParams.get(key) : (searchParams[key] as string | undefined);
  const rawLimit = Number(get('limit') ?? DEFAULT_PAGE_SIZE);
  const limit = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawLimit) ? rawLimit : DEFAULT_PAGE_SIZE;
  const page = Math.max(Number(get('page') ?? 1) || 1, 1);
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPagination(total: number, page: number, limit: number): Pagination {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const offset = (safePage - 1) * limit;
  return {
    total,
    page: safePage,
    limit,
    totalPages,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + limit, total),
  };
}

/** Windowed page numbers with ellipsis, e.g. 1 … 4 5 6 … 20 */
export function pageWindow(current: number, totalPages: number, window = 2): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [1];
  const pages = new Set<number>([1, totalPages]);
  for (let i = current - window; i <= current + window; i += 1) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const output: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) output.push('ellipsis');
    output.push(page);
    previous = page;
  }
  return output;
}
