'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  CheckCircle2,
  FileWarning,
  Package,
  Route,
  TrendingDown,
  TrendingUp,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { StaffDashboard } from '@/lib/types';
import type { RangeValue } from '@/components/data/date-range-filter';
import { StatCard } from '@/components/data/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DonutChart,
  ExpenseBreakdownChart,
  RevenueExpenseChart,
  TripsChart,
} from '@/components/charts/charts';

export function StaffDashboardView({ data, range }: { data: StaffDashboard; range: RangeValue }) {
  const { kpis, trends, series } = data;

  const expenseSplit = [
    { name: 'Fuel', value: kpis.fuelExpenses },
    { name: 'Maintenance', value: kpis.maintenanceExpenses },
    { name: 'Driver expenses', value: kpis.driverExpenses },
    { name: 'Trip costs', value: kpis.transportationCosts },
  ];

  return (
    <div className="space-y-6">
      {/* Financial position for the selected period. */}
      <section className="grid gap-4 grid-auto-fit" aria-label="Financial summary">
        <StatCard
          label="Revenue"
          value={formatCurrency(kpis.revenue)}
          icon={<TrendingUp />}
          tone="default"
          trend={trends.revenue}
          sparkline={{ data: series, dataKey: 'revenue', tone: 'revenue' }}
        />
        <StatCard
          label="Expenses"
          value={formatCurrency(kpis.totalExpenses)}
          icon={<TrendingDown />}
          tone="warning"
          trend={trends.expenses}
          invertTrend
          sparkline={{ data: series, dataKey: 'expenses', tone: 'expenses' }}
        />
        <StatCard
          label="Profit"
          value={formatCurrency(kpis.profit)}
          icon={<Wallet />}
          tone={kpis.profit >= 0 ? 'success' : 'danger'}
          trend={trends.profit}
          hint={`${kpis.margin.toFixed(1)}% margin`}
          sparkline={{ data: series, dataKey: 'profit', tone: 'profit' }}
        />
        <StatCard
          label="Trips in period"
          value={formatNumber(kpis.tripsInRange)}
          icon={<Route />}
          tone="info"
          trend={trends.trips}
          href="/trips"
          sparkline={{ data: series, dataKey: 'trips', tone: 'trips' }}
        />
      </section>

      {/* Live fleet position. */}
      <section className="grid gap-4 grid-auto-fit" aria-label="Fleet summary">
        <StatCard
          label="Total trucks"
          value={formatNumber(kpis.totalTrucks)}
          icon={<Truck />}
          tone="neutral"
          hint={`${kpis.availableTrucks} available · ${kpis.maintenanceTrucks} in maintenance`}
          href="/trucks"
        />
        <StatCard
          label="Active trucks"
          value={formatNumber(kpis.activeTrucks)}
          icon={<Truck />}
          tone="success"
          hint="Assigned or on the road"
          href="/trucks?status=IN_TRIP"
        />
        <StatCard
          label="Drivers"
          value={formatNumber(kpis.totalDrivers)}
          icon={<UserRound />}
          tone="info"
          hint={`${kpis.activeDrivers} active · ${kpis.invitedDrivers} invited`}
          href="/drivers"
        />
        <StatCard
          label="Active trips"
          value={formatNumber(kpis.activeTrips)}
          icon={<Package />}
          tone="default"
          hint={`${kpis.plannedTrips} planned · ${kpis.completedTrips} completed`}
          href="/trips?active=true"
        />
      </section>

      {/* Things that need someone's attention. */}
      {(kpis.pendingExpenseCount > 0 || kpis.openBreakdowns > 0 || kpis.expiringDocuments > 0) && (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Needs attention">
          <AttentionCard
            icon={<BadgeIndianRupee />}
            tone="warning"
            count={kpis.pendingExpenseCount}
            label="expenses awaiting review"
            detail={formatCurrency(kpis.pendingExpenseAmount)}
            href="/expenses?status=PENDING"
          />
          <AttentionCard
            icon={<AlertTriangle />}
            tone="danger"
            count={kpis.openBreakdowns}
            label="open breakdown reports"
            href="/breakdowns"
          />
          <AttentionCard
            icon={<FileWarning />}
            tone="info"
            count={kpis.expiringDocuments}
            label="documents expiring in 30 days"
            href="/documents?expiring=30"
          />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue, expenses and profit</CardTitle>
            <CardDescription>
              {formatDate(data.range.from)} — {formatDate(data.range.to)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueExpenseChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where the money goes</CardTitle>
            <CardDescription>Cost composition for the period</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={expenseSplit}
              centerValue={formatCurrency(kpis.totalExpenses)}
              centerLabel="Total expenses"
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Trips per period</CardTitle>
            <CardDescription>Volume over time</CardDescription>
          </CardHeader>
          <CardContent>
            <TripsChart data={series} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Expense breakdown</CardTitle>
            <CardDescription>Fuel, maintenance, driver claims and trip costs</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseBreakdownChart data={series} height={260} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Fleet status</CardTitle>
            <CardDescription>Where every truck is right now</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.fleetStatus.length === 0 ? (
              <EmptyState compact title="No trucks yet" />
            ) : (
              data.fleetStatus.map((entry) => {
                const share = kpis.totalTrucks ? (entry.count / kpis.totalTrucks) * 100 : 0;
                return (
                  <div key={entry.status} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <StatusBadge status={entry.status} />
                      <span className="tabular text-muted-foreground">
                        {entry.count} · {share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent trips</CardTitle>
              <CardDescription>The latest movements across the fleet</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/trips">
                View all
                <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentTrips.length === 0 ? (
              <EmptyState
                compact
                icon={<Route />}
                title="No trips yet"
                description="Create your first trip to start tracking revenue and costs."
                action={
                  <Button asChild size="sm">
                    <Link href="/trips">Go to trips</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {data.recentTrips.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/45"
                    >
                      <Avatar name={trip.driver?.name ?? '—'} color={trip.driver?.avatarColor} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          <span className="tabular">{trip.tripCode}</span>
                          <StatusBadge status={trip.status} size="sm" />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {trip.pickupLocation} → {trip.deliveryLocation}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="text-[13px] font-semibold tabular">{formatCurrency(trip.revenue)}</p>
                        <p className="text-2xs text-muted-foreground">{formatDate(trip.startDate)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AttentionCard({
  icon,
  tone,
  count,
  label,
  detail,
  href,
}: {
  icon: React.ReactNode;
  tone: 'warning' | 'danger' | 'info';
  count: number;
  label: string;
  detail?: string;
  href: string;
}) {
  if (!count) {
    return (
      <div className="surface-card flex items-center gap-3 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-success-soft text-success [&_svg]:size-4.5">
          <CheckCircle2 />
        </span>
        <p className="text-[13px] text-muted-foreground">
          Nothing pending — <span className="font-medium text-foreground">{humanise(label)}</span>
        </p>
      </div>
    );
  }

  const tones = {
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
    info: 'bg-info-soft text-info',
  };

  return (
    <Link href={href} className="surface-card group flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
      <span className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]} [&_svg]:size-4.5`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <span className="font-semibold tabular">{count}</span> {label}
        </p>
        {detail ? <p className="text-2xs text-muted-foreground">{detail} in total</p> : null}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
