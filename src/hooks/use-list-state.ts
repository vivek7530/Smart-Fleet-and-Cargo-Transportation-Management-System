'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounced } from './use-infinite-list';

export interface ListState {
  search: string;
  setSearch: (value: string) => void;
  /** Debounced copy — this is what goes to the API. */
  debouncedSearch: string;

  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;

  dateRange: { from: string; to: string };
  setDateRange: (range: { from: string; to: string }) => void;

  sortBy?: string;
  sortDir: 'asc' | 'desc';
  setSort: (sortBy: string, sortDir: 'asc' | 'desc') => void;

  /** Everything above, folded into API query parameters. */
  params: Record<string, string | undefined>;
  reset: () => void;
}

/**
 * Local state for a listing page: search, filters, sorting and a date range.
 * Initial values can be seeded from the URL so links like
 * `/expenses?status=PENDING` land on a pre-filtered view.
 */
export function useListState(options?: {
  defaultSort?: string;
  defaultSortDir?: 'asc' | 'desc';
  filterKeys?: string[];
}): ListState {
  const searchParams = useSearchParams();
  const { defaultSort, defaultSortDir = 'desc', filterKeys = [] } = options ?? {};

  const [search, setSearch] = React.useState(() => searchParams.get('search') ?? '');
  const [filters, setFilters] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of filterKeys) {
      const value = searchParams.get(key);
      if (value) initial[key] = value;
    }
    return initial;
  });
  const [dateRange, setDateRange] = React.useState({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  });
  const [sort, setSortState] = React.useState<{ sortBy?: string; sortDir: 'asc' | 'desc' }>({
    sortBy: searchParams.get('sortBy') ?? defaultSort,
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? defaultSortDir,
  });

  const debouncedSearch = useDebounced(search.trim(), 300);

  const setFilter = React.useCallback((key: string, value: string) => {
    setFilters((previous) => {
      const next = { ...previous };
      // "ALL" means the filter is off and should not reach the API.
      if (!value || value === 'ALL') delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const setSort = React.useCallback((sortBy: string, sortDir: 'asc' | 'desc') => {
    setSortState({ sortBy, sortDir });
  }, []);

  const reset = React.useCallback(() => {
    setSearch('');
    setFilters({});
    setDateRange({ from: '', to: '' });
    setSortState({ sortBy: defaultSort, sortDir: defaultSortDir });
  }, [defaultSort, defaultSortDir]);

  const params = React.useMemo(() => {
    const query: Record<string, string | undefined> = {
      search: debouncedSearch || undefined,
      sortBy: sort.sortBy,
      sortDir: sort.sortDir,
      from: dateRange.from || undefined,
      to: dateRange.to || undefined,
    };
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'ALL') query[key] = value;
    }
    return query;
  }, [debouncedSearch, filters, dateRange, sort]);

  return {
    search,
    setSearch,
    debouncedSearch,
    filters,
    setFilter,
    dateRange,
    setDateRange,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    setSort,
    params,
    reset,
  };
}
