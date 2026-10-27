'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Select } from './select';
import { SearchInput } from './search-input';
import { DatePicker } from './date-picker';

export interface FilterDefinition {
  key: string;
  type: 'select' | 'date' | 'search';
  label?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface FiltersProps {
  definitions: FilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  searchPlaceholder?: string;
  extra?: ReactNode;
}

/** Filter bar used above every table: search on the left, dropdowns on the right. */
export function Filters({ definitions, values, onChange, onClear, searchPlaceholder, extra }: FiltersProps) {
  const searchFilter = definitions.find((definition) => definition.type === 'search');
  const otherFilters = definitions.filter((definition) => definition.type !== 'search');
  const hasActive = Object.entries(values).some(([key, value]) => value && key !== 'page' && key !== 'limit');

  // Few filters sit beside the search box on wide screens; many filters drop
  // onto their own wrapped row so the search box and action buttons never squeeze.
  const compact = otherFilters.length <= 3;

  return (
    <div className={clsx('flex flex-col gap-3 border-b border-line px-4 py-3', compact && 'lg:flex-row lg:items-center lg:justify-between')}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-56 sm:max-w-xs">
          <SearchInput
            value={values[searchFilter?.key ?? 'search'] ?? ''}
            onChange={(value) => onChange(searchFilter?.key ?? 'search', value)}
            placeholder={searchPlaceholder ?? searchFilter?.placeholder ?? 'Search…'}
            autoFocusKey="/"
          />
        </div>
        {extra}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {otherFilters.map((definition) => (
          <div key={definition.key} className="w-full min-w-0 sm:w-[176px]">
            {definition.type === 'date' ? (
              <DatePicker
                value={values[definition.key] ?? ''}
                onChange={(value) => onChange(definition.key, value)}
                placeholder={definition.label ?? definition.placeholder ?? 'Select date'}
              />
            ) : (
              <Select
                size="sm"
                value={values[definition.key] ?? ''}
                onChange={(value) => onChange(definition.key, value)}
                placeholder={definition.label ?? definition.placeholder ?? 'All'}
                options={[{ value: '', label: definition.label ?? 'All' }, ...(definition.options ?? [])]}
                clearable={false}
              />
            )}
          </div>
        ))}
        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Chips summarising the currently applied filters. */
export function FilterChips({ values, labels, onRemove, exclude = ['page', 'limit', 'sortBy', 'sortDir'] }: {
  values: Record<string, string>;
  labels: Record<string, string>;
  onRemove: (key: string) => void;
  exclude?: string[];
}) {
  const active = Object.entries(values).filter(([key, value]) => value && !exclude.includes(key));
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <span className="text-xs font-medium text-ink-muted">Active filters:</span>
      {active.map(([key, value]) => (
        <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
          {labels[key] ?? key}: {value}
          <button type="button" onClick={() => onRemove(key)} aria-label={`Remove ${key} filter`} className="text-brand-600 hover:text-brand-900">
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
