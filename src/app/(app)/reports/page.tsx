'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Route, TrendingDown, TrendingUp, Truck, UserRound, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { ReportSummary } from '@/lib/types';
import { DateRangeFilter, rangeParams, type RangeValue } from '@/components/data/date-range-filter';
import { PageHeader } from '@/components/data/list-toolbar';
import { StatCard } from '@/components/data/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { Skeleton, SkeletonStatGrid } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import {
  DonutChart,
  ExpenseBreakdownChart,
  RankedBars,
  RevenueExpenseChart,
  TripsChart,
} from '@/components/charts/charts';

export default function ReportsPage() {
  const [range, setRange] = React.useState<RangeValue>({ preset: 'year' });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports', 'summary', range],
    queryFn: () => api.get<ReportSummary>('/reports/summary', rangeParams(range)),
  });

  const trend = (current: number, previous: number) => {
    if (!previous) return current ? null : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Revenue, cost and profit analysis across the fleet."
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {isError ? (
        <div className="surface-card">
          <ErrorState description={(error as Error)?.message} onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <ReportsSkeleton />
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">
            {formatDate(data.range.from)} — {formatDate(data.range.to)} · compared with the preceding period
          </p>

          <section className="grid gap-4 grid-auto-fit" aria-label="Financial totals">
            <StatCard
              label="Revenue"
              value={formatCurrency(data.totals.revenue)}
              icon={<TrendingUp />}
              trend={trend(data.totals.revenue, data.previousTotals.revenue)}
              sparkline={{ data: data.series, dataKey: 'revenue', tone: 'revenue' }}
            />
            <StatCard
              label="Expenses"
              value={formatCurrency(data.totals.totalExpenses)}
              icon={<TrendingDown />}
              tone="warning"
              invertTrend
              trend={trend(data.totals.totalExpenses, data.previousTotals.totalExpenses)}
              sparkline={{ data: data.series, dataKey: 'expenses', tone: 'expenses' }}
            />
            <StatCard
              label="Profit"
              value={formatCurrency(data.totals.profit)}
              icon={<Wallet />}
              tone={data.totals.profit >= 0 ? 'success' : 'danger'}
              trend={trend(data.totals.profit, data.previousTotals.profit)}
              hint={`${data.totals.margin.toFixed(1)}% margin`}
              sparkline={{ data: data.series, dataKey: 'profit', tone: 'profit' }}
            />
            <StatCard
              label="Trips"
              value={formatNumber(data.series.reduce((sum, point) => sum + point.trips, 0))}
              icon={<Route />}
              tone="info"
              sparkline={{ data: data.series, dataKey: 'trips', tone: 'trips' }}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue vs expenses</CardTitle>
                <CardDescription>Profit is the dashed line</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueExpenseChart data={data.series} height={320} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost composition</CardTitle>
                <CardDescription>Where the money went</CardDescription>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={[
                    { name: 'Fuel', value: data.totals.fuelExpenses },
                    { name: 'Maintenance', value: data.totals.maintenanceExpenses },
                    { name: 'Driver expenses', value: data.totals.driverExpenses },
                    { name: 'Trip costs', value: data.totals.transportationCosts },
                  ]}
                  centerValue={formatCurrency(data.totals.totalExpenses)}
                  centerLabel="Total"
                  height={280}
                />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Expenses over time</CardTitle>
                <CardDescription>Stacked by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ExpenseBreakdownChart data={data.series} height={280} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trip volume</CardTitle>
                <CardDescription>Movements per period</CardDescription>
              </CardHeader>
              <CardContent>
                <TripsChart data={data.series} height={280} />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="size-4 text-muted-foreground" />
                  Top drivers
                </CardTitle>
                <CardDescription>By revenue generated</CardDescription>
              </CardHeader>
              <CardContent>
                {data.topDrivers.length === 0 ? (
                  <EmptyState compact title="No trips in this period" />
                ) : (
                  <ul className="space-y-3.5">
                    {data.topDrivers.map((driver) => (
                      <li key={driver.id} className="flex items-center gap-3">
                        <Avatar name={driver.name} color={driver.avatarColor} size="xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{driver.name}</p>
                          <p className="text-2xs text-muted-foreground">{driver.trips} trips</p>
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold tabular">
                          {formatCurrency(driver.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-4 text-muted-foreground" />
                  Top trucks
                </CardTitle>
                <CardDescription>By revenue generated</CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  items={data.topTrucks.map((truck) => ({
                    label: `${truck.truckNumber} · ${truck.make}`,
                    value: truck.revenue,
                    secondary: `${truck.trips} trips`,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="size-4 text-muted-foreground" />
                  Busiest routes
                </CardTitle>
                <CardDescription>By number of trips</CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  items={data.topRoutes.map((route) => ({
                    label: route.route,
                    value: route.revenue,
                    secondary: `${route.trips} trips`,
                  }))}
                />
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Approved driver expenses by type</CardTitle>
              <CardDescription>What drivers actually spend on the road</CardDescription>
            </CardHeader>
            <CardContent>
              {data.expensesByType.length === 0 ? (
                <EmptyState compact title="No approved expenses in this period" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {data.expensesByType.map((entry) => (
                    <div key={entry.type} className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-xs text-muted-foreground">{humanise(entry.type)}</p>
                      <p className="mt-1 text-lg font-semibold tabular">{formatCurrency(entry.amount)}</p>
                      <p className="text-2xs text-muted-foreground">
                        {entry.count} claim{entry.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-72" />
      <SkeletonStatGrid count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
