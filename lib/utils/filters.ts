/** Turns request query strings into a normalised, whitelisted filter object. */
import type { ListParams } from '@/types/api';

export function parseListParams(
  searchParams: URLSearchParams,
  allowed: string[] = []
): ListParams {
  const params: ListParams = {
    page: Number(searchParams.get('page') ?? 1) || 1,
    limit: Number(searchParams.get('limit') ?? 10) || 10,
    search: searchParams.get('search')?.trim() || undefined,
    sortBy: searchParams.get('sortBy') ?? undefined,
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? 'desc',
    status: searchParams.get('status') ?? undefined,
    dateFrom: searchParams.get('dateFrom') ?? undefined,
    dateTo: searchParams.get('dateTo') ?? undefined,
  };

  for (const key of allowed) {
    const value = searchParams.get(key);
    if (value !== null && value !== '' && value !== 'all') {
      params[key] = value;
    }
  }
  return params;
}

/** Reads a repeatable query param, e.g. ?ids=1&ids=2 */
export function parseIdList(searchParams: URLSearchParams, key: string): number[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Counts active filters so the UI can show a "Clear filters" affordance. */
export function activeFilterCount(params: Record<string, unknown>, ignore: string[] = ['page', 'limit']): number {
  return Object.entries(params).filter(
    ([key, value]) =>
      !ignore.includes(key) &&
      value !== undefined &&
      value !== null &&
      value !== '' &&
      value !== 'all' &&
      !(key === 'sortDir' && value === 'desc')
  ).length;
}

/** SQL fragment for an optional multi-select filter. */
export function buildMultiFilter(column: string, raw: string | null | undefined, values: unknown[]): string {
  if (!raw || raw === 'all') return '';
  const items = raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (!items.length) return '';
  items.forEach((item) => values.push(item));
  return ` AND ${column} IN (${items.map(() => '?').join(', ')})`;
}
