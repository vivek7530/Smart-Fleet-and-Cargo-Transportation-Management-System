'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { dashboardQuery, DEFAULT_DASHBOARD_RANGE } from '@/lib/queries';
import type { DriverDashboard, StaffDashboard } from '@/lib/types';
import { DateRangeFilter, type RangeValue } from '@/components/data/date-range-filter';
import { PageHeader } from '@/components/data/list-toolbar';
import { RefetchBar, Skeleton, SkeletonStatGrid } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/motion/primitives';
import { StaffDashboardView } from './staff-dashboard';
import { DriverDashboardView } from './driver-dashboard';

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = React.useState<RangeValue>(DEFAULT_DASHBOARD_RANGE);

  const isDriver = user?.role === 'DRIVER';

  const { data, isLoading, isError, error, refetch, isPlaceholderData, isFetching } = useQuery({
    ...dashboardQuery(user?.role, range),
    // Switching the period keeps the current figures up (and animates them to
    // the new values) instead of blanking the page.
    placeholderData: keepPreviousData,
  });

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
        description={
          isDriver
            ? 'Your trips, truck and expense claims at a glance.'
            : 'Fleet performance, live operations and financial position.'
        }
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <RefetchBar active={isPlaceholderData && isFetching} className="-mt-4 rounded-full" />

      {isError ? (
        <div className="surface-card">
          <ErrorState
            title="Could not load the dashboard"
            description={(error as Error)?.message}
            onRetry={() => refetch()}
          />
        </div>
      ) : isLoading || !data ? (
        isDriver ? <DriverDashboardSkeleton /> : <StaffDashboardSkeleton />
      ) : (
        <FadeIn className={isPlaceholderData ? 'pointer-events-none opacity-70 transition-opacity' : 'transition-opacity'}>
          {isDriver ? (
            <DriverDashboardView data={data as DriverDashboard} />
          ) : (
            <StaffDashboardView data={data as StaffDashboard} range={range} />
          )}
        </FadeIn>
      )}
    </div>
  );
}

function ChartCardSkeleton({ className, height = 280 }: { className?: string; height?: number }) {
  return (
    <div className={`surface-card space-y-5 p-6 ${className ?? ''}`}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-48 rounded-full" />
        <Skeleton className="h-3 w-32 rounded-full" />
      </div>
      <Skeleton className="w-full rounded-xl" style={{ height }} />
    </div>
  );
}

/** Same sections, same sizes, same order as StaffDashboardView. */
function StaffDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="surface-card space-y-5 p-6 xl:col-span-8">
          <Skeleton className="h-3 w-48 rounded-full" />
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-[74px] w-full rounded-lg" />
          <Skeleton className="h-[190px] w-full rounded-lg" />
        </div>
        <div className="surface-card space-y-5 p-6 xl:col-span-4">
          <Skeleton className="h-4 w-32 rounded-full" />
          <div className="flex items-center gap-5">
            <Skeleton className="size-[132px] rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-12 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-md" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-2.5 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-3 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card grid grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-4 p-5">
            <Skeleton className="size-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-6 w-12 rounded-md" />
              <Skeleton className="h-2.5 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="surface-card xl:col-span-8">
          <div className="space-y-2 p-6">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-3 w-48 rounded-full" />
          </div>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-4 border-t border-border/60 px-6 py-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-3 w-40 rounded-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-16 rounded-md" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <ChartCardSkeleton height={150} />
          <ChartCardSkeleton height={120} />
        </div>
      </div>
    </div>
  );
}

function DriverDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <SkeletonStatGrid count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" height={240} />
        <ChartCardSkeleton height={240} />
      </div>
    </div>
  );
}
