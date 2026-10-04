'use client';

import * as React from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Page } from '@/lib/types';

export const DEFAULT_PAGE_SIZE = 10;

export interface InfiniteListOptions {
  /** API path, e.g. "/trucks". */
  path: string;
  /** Extra query parameters — becomes part of the cache key. */
  params?: Record<string, string | number | boolean | undefined | null>;
  limit?: number;
  enabled?: boolean;
  queryKey?: QueryKey;
}

/**
 * Cursor-paginated infinite list.
 *
 * The first request asks for 10 rows and every subsequent fetch uses the cursor
 * returned by the API, so paging stays stable while records are being inserted.
 */
export function useInfiniteList<T>({
  path,
  params = {},
  limit = DEFAULT_PAGE_SIZE,
  enabled = true,
  queryKey,
}: InfiniteListOptions) {
  const key = queryKey ?? [path, { ...params, limit }];

  const query = useInfiniteQuery<Page<T>>({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<Page<T>>(path, { ...params, limit, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });

  const items = React.useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
    /** Server-side count of everything matching the current filters. */
    total: query.data?.pages[0]?.total,
    isEmpty: !query.isLoading && items.length === 0,
  };
}

/**
 * Fires `onIntersect` while the sentinel is visible.
 *
 * `rootMargin` is generous on purpose: the next page starts loading well before
 * the user reaches the bottom, so scrolling never stalls.
 */
export function useInfiniteScroll<E extends HTMLElement = HTMLDivElement>({
  onIntersect,
  enabled = true,
  rootMargin = '600px',
  root,
}: {
  onIntersect: () => void;
  enabled?: boolean;
  rootMargin?: string;
  root?: HTMLElement | null;
}) {
  const sentinelRef = React.useRef<E | null>(null);
  const callbackRef = React.useRef(onIntersect);
  callbackRef.current = onIntersect;

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { root: root ?? null, rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin, root]);

  return sentinelRef;
}

/** Delays a rapidly changing value — used for search inputs. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Matches a CSS media query on the client. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
