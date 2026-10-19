import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DriverDashboard, Role, StaffDashboard } from '@/lib/types';
import { rangeParams, type RangeValue } from '@/components/data/date-range-filter';

export const DEFAULT_DASHBOARD_RANGE: RangeValue = { preset: 'month' };

/**
 * One definition for the dashboard payload. The dashboard page, the sidebar
 * badges and the post-login prefetch all share this cache entry, so the API is
 * hit once instead of once per consumer.
 */
export function dashboardQuery(role: Role | undefined, range: RangeValue = DEFAULT_DASHBOARD_RANGE) {
  return queryOptions({
    queryKey: ['dashboard', role, range] as const,
    queryFn: () => api.get<StaffDashboard | DriverDashboard>('/reports/dashboard', rangeParams(range)),
    enabled: Boolean(role),
    staleTime: 60_000,
  });
}
