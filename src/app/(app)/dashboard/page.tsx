'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { api } from '@/lib/api';
import type { DriverDashboard, StaffDashboard } from '@/lib/types';
import { DateRangeFilter, rangeParams, type RangeValue } from '@/components/data/date-range-filter';
import { PageHeader } from '@/components/data/list-toolbar';
import { SkeletonStatGrid, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { StaffDashboardView } from './staff-dashboard';
import { DriverDashboardView } from './driver-dashboard';

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = React.useState<RangeValue>({ preset: 'month' });

  const isDriver = user?.role === 'DRIVER';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', user?.role, range],
    queryFn: () => api.get<StaffDashboard | DriverDashboard>('/reports/dashboard', rangeParams(range)),
    enabled: Boolean(user),
  });

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${user?.name.split(' ')[0] ?? ''}`}
        description={
          isDriver
            ? 'Your trips, truck and expense claims at a glance.'
            : 'Fleet performance, live operations and financial position.'
        }
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {isError ? (
        <div className="surface-card">
          <ErrorState
            title="Could not load the dashboard"
            description={(error as Error)?.message}
            onRetry={() => refetch()}
          />
        </div>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : isDriver ? (
        <DriverDashboardView data={data as DriverDashboard} />
      ) : (
        <StaffDashboardView data={data as StaffDashboard} range={range} />
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonStatGrid count={4} />
      <SkeletonStatGrid count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card space-y-4 p-5 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
        <div className="surface-card space-y-4 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </div>
      </div>
      <div className="surface-card space-y-3 p-5">
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
