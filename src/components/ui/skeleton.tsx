import { cn } from '@/lib/utils';

/**
 * Base skeleton block. Every block on screen shares one sweeping highlight
 * (see `.skeleton-shimmer`), so loading reads as a single calm wave.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton-shimmer rounded-lg', className)} aria-hidden {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3 rounded-full"
          style={{ width: `${index === lines - 1 ? 55 : 92 - index * 7}%` }}
        />
      ))}
    </div>
  );
}

/** Matches StatCard: icon tile + trend chip, label, figure, hint. */
export function SkeletonStatCard() {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-24 rounded-full" />
      <Skeleton className="mt-2.5 h-7 w-32 rounded-md" />
      <div className="mt-3 flex min-h-8 items-end justify-between">
        <Skeleton className="h-2.5 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-auto-fit">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonStatCard key={index} />
      ))}
    </div>
  );
}

/** Placeholder rows for the shared list component. */
export function SkeletonRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 px-5 py-4"
          // Rows further down fade out so the list does not look like a wall.
          style={{ opacity: 1 - rowIndex * (0.6 / rows) }}
        >
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex flex-1 items-center gap-6">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div key={columnIndex} className={cn('flex-1 space-y-2', columnIndex > 1 && 'hidden md:block')}>
                <Skeleton
                  className="h-3 rounded-full"
                  style={{ width: `${72 - ((columnIndex * 13 + rowIndex * 7) % 30)}%` }}
                />
                {columnIndex === 0 ? <Skeleton className="h-2.5 w-2/5 rounded-full" /> : null}
              </div>
            ))}
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  const heights = [42, 66, 51, 78, 60, 88, 47, 72, 55, 83, 63, 70];
  return (
    <div className={cn('flex h-[240px] items-end gap-2.5 px-1', className)}>
      {heights.map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-lg rounded-b-sm" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-auto-fit">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface-card space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3 rounded-full" />
              <Skeleton className="h-2.5 w-1/3 rounded-full" />
            </div>
          </div>
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}

/** Thin indeterminate bar for in-place refetches, used instead of a skeleton. */
export function RefetchBar({ active, className }: { active: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none h-0.5 overflow-hidden transition-opacity duration-300',
        active ? 'opacity-100' : 'opacity-0',
        className,
      )}
      aria-hidden
    >
      <div className="h-full w-1/3 animate-progress-slide rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );
}
