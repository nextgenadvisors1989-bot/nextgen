'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api-client';
import type { Pagination } from '@/types/api';

export interface UseListOptions {
  endpoint: string;
  initialFilters?: Record<string, string>;
  initialLimit?: number;
  /** Column the server should sort by when the screen first loads. */
  initialSortBy?: string;
  initialSortDir?: 'asc' | 'desc';
  enabled?: boolean;
}

export interface UseListResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  pagination: Pagination;
  filters: Record<string, string>;
  /** Everything the list route returned besides `data`/`pagination` — stats,
   *  filter option lists, `scope`, and so on. */
  extra: Record<string, unknown>;
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  setFilter: (key: string, value: string) => void;
  setFilters: (next: Record<string, string>) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  toggleSort: (column: string) => void;
  refresh: () => void;
}

const EMPTY_PAGINATION: Pagination = { total: 0, page: 1, limit: 10, totalPages: 1, from: 0, to: 0 };

/**
 * List-view state machine shared by every table in the platform: search,
 * filters, sorting, pagination and refresh against the documented
 * `{ success, data, pagination }` API envelope.
 */
export function useList<T = Record<string, unknown>>({
  endpoint,
  initialFilters = {},
  initialLimit = 10,
  initialSortBy,
  initialSortDir = 'desc',
  enabled = true,
}: UseListOptions): UseListResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<Record<string, string>>(initialFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(initialLimit);
  const [pagination, setPagination] = useState<Pagination>({ ...EMPTY_PAGINATION, limit: initialLimit });
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [sortBy, setSortBy] = useState<string | undefined>(initialSortBy);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [reloadToken, setReloadToken] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'all') params.set(key, value);
    }
    if (sortBy) {
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
    }
    return params.toString();
  }, [page, limit, filters, sortBy, sortDir]);

  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const current = ++requestId.current;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await api.get<T[]>(`${endpoint}?${queryString}`);
      // Ignore out-of-order responses (fast typing in the search box).
      if (cancelled || current !== requestId.current) return;

      if (result.ok && Array.isArray(result.data)) {
        setData(result.data);
        setPagination(result.pagination ?? { ...EMPTY_PAGINATION, limit, total: result.data.length, to: result.data.length });
        const envelope = (result.raw ?? {}) as Record<string, unknown>;
        const { data: _data, pagination: _pagination, success: _success, message: _message, ...rest } = envelope;
        setExtra(rest);
      } else if (result.ok) {
        setData([]);
      } else {
        setError(result.message);
        setData([]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoint, queryString, enabled, limit, reloadToken]);

  const setFilter = useCallback((key: string, value: string) => {
    setFiltersState((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const setFilters = useCallback((next: Record<string, string>) => {
    setFiltersState(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(initialFilters);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLimit = useCallback((next: number) => {
    setLimitState(next);
    setPage(1);
  }, []);

  const toggleSort = useCallback(
    (column: string) => {
      setSortDir((current) => (sortBy === column && current === 'desc' ? 'asc' : 'desc'));
      setSortBy(column);
    },
    [sortBy]
  );

  return {
    data, loading, error, pagination, filters, extra, page, limit, sortBy, sortDir,
    setFilter, setFilters, clearFilters, setPage, setLimit, toggleSort,
    refresh: () => setReloadToken((token) => token + 1),
  };
}
