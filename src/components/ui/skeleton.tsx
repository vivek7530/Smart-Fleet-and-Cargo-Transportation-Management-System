import { cn } from '@/lib/utils';

/**
 * Base skeleton block. Every list, card and detail view renders these while
 * loading rather than a bare spinner.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton-shimmer rounded-md', className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3"
          style={{ width: `${index === lines - 1 ? 55 : 88 - index * 6}%` }}
        />
      ))}
    </div>
  );
}

/** Placeholder matching the KPI card layout. */
export function SkeletonStatCard() {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="size-9 rounded-lg" />
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
    <div className="divide-y divide-border/70">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex flex-1 items-center gap-6">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div key={columnIndex} className="flex-1 space-y-1.5">
                <Skeleton className="h-3" style={{ width: `${70 - columnIndex * 9}%` }} />
                {columnIndex === 0 ? <Skeleton className="h-2.5 w-1/3" /> : null}
              </div>
            ))}
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  const heights = [42, 66, 51, 78, 60, 88, 47, 72, 55, 83, 63, 70];
  return (
    <div className={cn('flex h-[240px] items-end gap-2 px-1', className)}>
      {heights.map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-auto-fit">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface-card space-y-3 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}
