'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { RefetchBar, SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { errorMessage } from '@/lib/api';

/** Rows are recycled through a virtualizer once a list grows past this size. */
const VIRTUALIZE_THRESHOLD = 60;
const ESTIMATED_ROW_HEIGHT = 64;
/** How many rows from the end the next page starts loading. */
const PREFETCH_ROWS_FROM_END = 5;
/** Rows per page; the cascade restarts for each newly loaded page. */
const DEFAULT_PAGE = 10;

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Grid track for this column, e.g. "minmax(180px, 1.4fr)". */
  width?: string;
  align?: 'left' | 'right' | 'center';
  /** Sort key sent to the API; omit to make the column unsortable. */
  sortKey?: string;
  /** Hidden below the given breakpoint to keep narrow screens readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  render: (item: T) => React.ReactNode;
}

export interface DataListProps<T> {
  items: T[];
  columns: Column<T>[];
  getRowId: (item: T) => string;

  isLoading: boolean;
  /** A filter or search change is loading while the previous rows stay visible. */
  isRefetching?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;

  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  /** Server-side count of everything matching the current filters. */
  total?: number;

  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;

  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => React.ReactNode;
  /** Card layout used on small screens instead of the grid row. */
  mobileRow?: (item: T) => React.ReactNode;

  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;

  skeletonRows?: number;
  className?: string;
  /** Fixed viewport height (px) used when the list virtualizes. */
  virtualHeight?: number;
}

export function DataList<T>({
  items,
  columns,
  getRowId,
  isLoading,
  isRefetching = false,
  isError,
  error,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  total,
  sortBy,
  sortDir = 'desc',
  onSortChange,
  onRowClick,
  rowActions,
  mobileRow,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  skeletonRows = 8,
  className,
  virtualHeight = 640,
}: DataListProps<T>) {
  const shouldVirtualize = items.length >= VIRTUALIZE_THRESHOLD;

  const templateColumns = React.useMemo(() => {
    const tracks = columns.map((column) => column.width ?? 'minmax(120px, 1fr)');
    if (rowActions) tracks.push('56px');
    return tracks.join(' ');
  }, [columns, rowActions]);

  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage?.();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isError) {
    return (
      <div className={cn('surface-card', className)}>
        <ErrorState description={errorMessage(error)} onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('surface-card overflow-hidden', className)}>
        <HeaderRow columns={columns} templateColumns={templateColumns} hasActions={Boolean(rowActions)} />
        <SkeletonRows rows={skeletonRows} columns={Math.min(columns.length, 4)} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn('surface-card', className)}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn('surface-card relative overflow-hidden', className)}
    >
      <RefetchBar active={isRefetching} className="absolute inset-x-0 top-0 z-10" />
      <HeaderRow
        columns={columns}
        templateColumns={templateColumns}
        hasActions={Boolean(rowActions)}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />

      <div className={cn('transition-opacity duration-300', isRefetching && 'opacity-60')}>
      {shouldVirtualize ? (
        <VirtualBody
          items={items}
          columns={columns}
          getRowId={getRowId}
          templateColumns={templateColumns}
          onRowClick={onRowClick}
          rowActions={rowActions}
          mobileRow={mobileRow}
          height={virtualHeight}
          onNearEnd={loadMore}
        />
      ) : (
        <PlainBody
          items={items}
          columns={columns}
          getRowId={getRowId}
          templateColumns={templateColumns}
          onRowClick={onRowClick}
          rowActions={rowActions}
          mobileRow={mobileRow}
          onNearEnd={loadMore}
          canLoadMore={Boolean(hasNextPage)}
        />
      )}
      </div>

      <ListFooter
        isFetchingNextPage={Boolean(isFetchingNextPage)}
        hasNextPage={Boolean(hasNextPage)}
        count={items.length}
        total={total}
        onLoadMore={loadMore}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ internals */

function HeaderRow<T>({
  columns,
  templateColumns,
  hasActions,
  sortBy,
  sortDir,
  onSortChange,
}: {
  columns: Column<T>[];
  templateColumns: string;
  hasActions: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
}) {
  return (
    <div
      role="row"
      className="hidden items-center gap-4 border-b bg-muted/40 px-5 py-2.5 md:grid"
      style={{ gridTemplateColumns: templateColumns }}
    >
      {columns.map((column) => {
        const active = Boolean(column.sortKey && sortBy === column.sortKey);
        const sortable = Boolean(column.sortKey && onSortChange);

        return (
          <div
            key={column.key}
            role="columnheader"
            aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            className={cn(
              'min-w-0 text-xs font-medium text-muted-foreground',
              column.align === 'right' && 'text-right',
              column.align === 'center' && 'text-center',
              hideBelowClass(column.hideBelow),
              column.className,
            )}
          >
            {sortable ? (
              <button
                type="button"
                onClick={() =>
                  onSortChange!(column.sortKey!, active && sortDir === 'desc' ? 'asc' : 'desc')
                }
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors hover:text-foreground focus-ring',
                  active && 'text-foreground',
                  column.align === 'right' && 'flex-row-reverse',
                )}
              >
                {column.header}
                {active ? (
                  sortDir === 'asc' ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  )
                ) : (
                  <ChevronsUpDown className="size-3 opacity-40" />
                )}
              </button>
            ) : (
              column.header
            )}
          </div>
        );
      })}
      {hasActions ? <div role="columnheader" className="sr-only">Actions</div> : null}
    </div>
  );
}

interface BodyProps<T> {
  items: T[];
  columns: Column<T>[];
  getRowId: (item: T) => string;
  templateColumns: string;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => React.ReactNode;
  mobileRow?: (item: T) => React.ReactNode;
  onNearEnd: () => void;
}

function PlainBody<T>({
  items,
  columns,
  getRowId,
  templateColumns,
  onRowClick,
  rowActions,
  mobileRow,
  onNearEnd,
  canLoadMore,
}: BodyProps<T> & { canLoadMore: boolean }) {
  // The sentinel sits five rows from the end, so the next page is requested
  // long before the user actually reaches the bottom.
  const triggerIndex = Math.max(0, items.length - PREFETCH_ROWS_FROM_END);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const callback = React.useRef(onNearEnd);
  callback.current = onNearEnd;

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: '400px 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, triggerIndex, items.length]);

  return (
    <div role="rowgroup" className="divide-y divide-border/60">
      {items.map((item, index) => (
        <React.Fragment key={getRowId(item)}>
          {index === triggerIndex ? <div ref={sentinelRef} aria-hidden className="h-0" /> : null}
          <Row
            index={index % DEFAULT_PAGE}
            item={item}
            columns={columns}
            templateColumns={templateColumns}
            onRowClick={onRowClick}
            rowActions={rowActions}
            mobileRow={mobileRow}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function VirtualBody<T>({
  items,
  columns,
  getRowId,
  templateColumns,
  onRowClick,
  rowActions,
  mobileRow,
  height,
  onNearEnd,
}: BodyProps<T> & { height: number }) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? 0;

  // Same five-rows-remaining rule as the non-virtualised list.
  React.useEffect(() => {
    if (lastVisibleIndex >= items.length - PREFETCH_ROWS_FROM_END) onNearEnd();
  }, [lastVisibleIndex, items.length, onNearEnd]);

  return (
    <div ref={scrollRef} role="rowgroup" className="overflow-auto" style={{ height }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualRows.map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={getRowId(item)}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute inset-x-0 top-0 border-b border-border/70"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <Row
                item={item}
                columns={columns}
                templateColumns={templateColumns}
                onRowClick={onRowClick}
                rowActions={rowActions}
                mobileRow={mobileRow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row<T>({
  index,
  item,
  columns,
  templateColumns,
  onRowClick,
  rowActions,
  mobileRow,
}: {
  /** Position within its page; drives the cascade delay. Omitted for virtual rows. */
  index?: number;
  item: T;
  columns: Column<T>[];
  templateColumns: string;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => React.ReactNode;
  mobileRow?: (item: T) => React.ReactNode;
}) {
  const interactive = Boolean(onRowClick);
  const animated = index !== undefined;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(item);
    }
  };

  return (
    <motion.div
      initial={animated ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: animated ? Math.min(index, 12) * 0.035 : 0 }}
      role="row"
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onRowClick?.(item) : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative transition-colors duration-200 focus-ring',
        interactive &&
          'cursor-pointer hover:bg-muted/50 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:scale-y-0 before:rounded-r-full before:bg-primary before:transition-transform before:duration-200 hover:before:scale-y-100',
      )}
    >
      {/* Desktop: aligned grid columns. */}
      <div
        className={cn(
          'hidden items-center gap-4 px-5 py-3.5 transition-transform duration-300 ease-out md:grid',
          interactive && 'group-hover:translate-x-1',
        )}
        style={{ gridTemplateColumns: templateColumns }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            role="cell"
            className={cn(
              'min-w-0 text-[13.5px]',
              column.align === 'right' && 'text-right',
              column.align === 'center' && 'text-center',
              hideBelowClass(column.hideBelow),
              column.className,
            )}
          >
            {column.render(item)}
          </div>
        ))}
        {rowActions ? (
          <div
            role="cell"
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {rowActions(item)}
          </div>
        ) : null}
      </div>

      {/* Mobile: stacked card so nothing is squeezed off-screen. */}
      <div className="px-4 py-4 md:hidden">
        {mobileRow ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">{mobileRow(item)}</div>
            {rowActions ? (
              <div onClick={(event) => event.stopPropagation()}>{rowActions(item)}</div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {columns.slice(0, 4).map((column) => (
              <div key={column.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-xs text-muted-foreground">{column.header}</span>
                <span className="min-w-0 text-right">{column.render(item)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ListFooter({
  isFetchingNextPage,
  hasNextPage,
  count,
  total,
  onLoadMore,
}: {
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  count: number;
  total?: number;
  onLoadMore: () => void;
}) {
  if (isFetchingNextPage) {
    return (
      <div className="flex items-center justify-center gap-2 border-t bg-muted/25 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading more…
      </div>
    );
  }

  if (hasNextPage) {
    // Scrolling loads the next page automatically; this button is the keyboard
    // accessible fallback for when the observer cannot fire.
    return (
      <div className="flex items-center justify-center gap-3 border-t bg-muted/25 py-2.5 text-xs text-muted-foreground">
        <span>
          Showing {count}
          {total !== undefined ? ` of ${total}` : ''}
        </span>
        <button
          type="button"
          onClick={onLoadMore}
          className="rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-primary-soft focus-ring"
        >
          Load more
        </button>
      </div>
    );
  }

  if (count > 0) {
    return (
      <div className="border-t bg-muted/25 py-2.5 text-center text-xs text-muted-foreground">
        {count === 1 ? '1 record' : `All ${count} records loaded`}
      </div>
    );
  }

  return null;
}

function hideBelowClass(breakpoint?: Column<unknown>['hideBelow']) {
  switch (breakpoint) {
    case 'sm':
      return 'hidden sm:block';
    case 'md':
      return 'hidden md:block';
    case 'lg':
      return 'hidden lg:block';
    case 'xl':
      return 'hidden xl:block';
    default:
      return undefined;
  }
}
