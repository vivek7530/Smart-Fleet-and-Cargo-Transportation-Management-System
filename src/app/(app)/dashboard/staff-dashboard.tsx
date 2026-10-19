'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  Accident,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  BadgeIndianRupee,
  CheckCircle2,
  FileWarning,
  MapPin,
  Package,
  Route,
  Steering,
  Truck,
} from '@/components/icons';
import { cn, humanise } from '@/lib/utils';
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber, formatPercent } from '@/lib/format';
import type { SeriesPoint, StaffDashboard, TripStatus } from '@/lib/types';
import type { RangeValue } from '@/components/data/date-range-filter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ExpenseBreakdownChart, TripsChart } from '@/components/charts/charts';
import { useChartPalette } from '@/components/charts/chart-theme';
import { CountUp, EASE_OUT, riseItem, Stagger } from '@/components/motion/primitives';

const FLEET_COLORS: Record<string, string> = {
  AVAILABLE: '#0E9F6E',
  ASSIGNED: '#2563EB',
  IN_TRIP: '#E2601E',
  MAINTENANCE: '#D97706',
  INACTIVE: '#94A3B8',
};

const COST_COLORS = ['#F59E0B', '#7C3AED', '#DB2777', '#0D9488'];

/** How far along its journey a trip in each state is drawn. */
const TRIP_PROGRESS: Record<TripStatus, number> = {
  PLANNED: 6,
  ASSIGNED: 20,
  LOADING: 38,
  IN_TRANSIT: 66,
  DELIVERED: 90,
  COMPLETED: 100,
  CANCELLED: 0,
};

export function StaffDashboardView({ data }: { data: StaffDashboard; range: RangeValue }) {
  const { kpis } = data;

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-12">
        <CommandHero data={data} className="xl:col-span-8" />
        <MarginCard data={data} className="xl:col-span-4" />
      </section>

      <FleetStrip data={data} />

      <section className="grid gap-5 xl:grid-cols-12">
        <LiveTrips data={data} className="xl:col-span-8" />
        <div className="grid gap-5 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <AttentionPanel data={data} />
          <FleetStatusPanel data={data} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Trips over time</CardTitle>
            <CardDescription>{formatNumber(kpis.tripsInRange)} trips in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <TripsChart data={data.series} height={250} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle>Cost breakdown</CardTitle>
            <CardDescription>Fuel, maintenance, driver claims and trip costs per period</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseBreakdownChart data={data.series} height={250} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Command hero */

function DeltaChip({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) return null;
  const flat = Math.abs(value) < 0.05;
  const good = invert ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular',
        flat ? 'bg-muted text-muted-foreground' : good ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
      )}
      title="Compared with the previous period"
    >
      {value > 0 ? <ArrowUpRight className="size-3.5" /> : value < 0 ? <ArrowDownRight className="size-3.5" /> : null}
      {formatPercent(value)}
    </span>
  );
}

function HeroTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold tabular">{formatCurrency(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function HeroChart({ data }: { data: SeriesPoint[] }) {
  const palette = useChartPalette();

  if (data.length < 2) {
    return (
      <div className="flex h-[190px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        A trend appears once there is more than one period of data.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="heroRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.revenue} stopOpacity={0.22} />
            <stop offset="100%" stopColor={palette.revenue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="heroExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.expenses} stopOpacity={0.14} />
            <stop offset="100%" stopColor={palette.expenses} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={palette.grid} />
        <XAxis
          dataKey="label"
          stroke={palette.axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
        />
        <Tooltip content={<HeroTooltip />} cursor={{ stroke: palette.grid, strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke={palette.expenses}
          strokeWidth={1.75}
          fill="url(#heroExpenses)"
          animationDuration={1100}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={palette.revenue}
          strokeWidth={2.25}
          fill="url(#heroRevenue)"
          animationDuration={1300}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: palette.revenue }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CommandHero({ data, className }: { data: StaffDashboard; className?: string }) {
  const { kpis, trends } = data;
  const palette = useChartPalette();

  const metrics = [
    { label: 'Expenses', value: formatCurrency(kpis.totalExpenses), trend: trends.expenses, invert: true },
    { label: 'Profit', value: formatCurrency(kpis.profit), trend: trends.profit, invert: false },
    { label: 'Trips', value: formatNumber(kpis.tripsInRange), trend: trends.trips, invert: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className={cn('surface-card p-6', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Revenue · {formatDate(data.range.from, 'd MMM')} – {formatDate(data.range.to, 'd MMM yyyy')}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <p className="text-4xl font-semibold tracking-tight">
              <CountUp value={formatCurrency(kpis.revenue)} duration={1.3} />
            </p>
            <DeltaChip value={trends.revenue} />
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/reports">
            Full report
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x rounded-lg border">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 px-4 py-3">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold tabular">
                <CountUp value={metric.value} />
              </p>
              <DeltaChip value={metric.trend} invert={metric.invert} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: palette.revenue }} />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: palette.expenses }} />
            Expenses
          </span>
        </div>
        <HeroChart data={data.series} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- Margin card */

function MarginCard({ data, className }: { data: StaffDashboard; className?: string }) {
  const { kpis } = data;
  const margin = Number.isFinite(kpis.margin) ? kpis.margin : 0;
  const negative = margin < 0;
  const fill = Math.min(1, Math.abs(margin) / 100);
  const radius = 54;

  const costs = [
    { label: 'Fuel', value: kpis.fuelExpenses },
    { label: 'Maintenance', value: kpis.maintenanceExpenses },
    { label: 'Driver claims', value: kpis.driverExpenses },
    { label: 'Trip costs', value: kpis.transportationCosts },
  ];
  const totalCost = costs.reduce((sum, cost) => sum + cost.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.08 }}
      className={cn('surface-card flex flex-col p-6', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Profit margin</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Share of revenue kept</p>
        </div>
        <DeltaChip value={data.trends.profit} />
      </div>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative size-[132px] shrink-0">
          <svg viewBox="0 0 132 132" className="size-full -rotate-90">
            <defs>
              <linearGradient id="marginRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={negative ? '#F43F5E' : '#FF8A47'} />
                <stop offset="100%" stopColor={negative ? '#BE123C' : '#D44511'} />
              </linearGradient>
            </defs>
            <circle cx="66" cy="66" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
            <motion.circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke="url(#marginRing)"
              strokeWidth="12"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: fill }}
              transition={{ duration: 1.3, ease: EASE_OUT, delay: 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-2xl font-semibold leading-none tracking-tight', negative && 'text-destructive')}>
              <CountUp value={`${margin.toFixed(1)}%`} />
            </span>
            <span className="mt-1 text-xs text-muted-foreground">margin</span>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Profit</p>
            <p className={cn('text-xl font-bold tabular', negative ? 'text-destructive' : 'text-success')}>
              <CountUp value={formatCurrency(kpis.profit)} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total cost</p>
            <p className="text-base font-semibold tabular">{formatCurrency(kpis.totalExpenses)}</p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">Where the money goes</p>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          {costs.map((cost, index) =>
            totalCost > 0 && cost.value > 0 ? (
              <motion.div
                key={cost.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ background: COST_COLORS[index] }}
                initial={{ width: 0 }}
                animate={{ width: `${(cost.value / totalCost) * 100}%` }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 + index * 0.08 }}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {costs.map((cost, index) => (
            <li key={cost.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: COST_COLORS[index] }} />
                <span className="truncate">{cost.label}</span>
              </span>
              <span className="font-semibold tabular">{formatCurrencyCompact(cost.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- Fleet strip */

function FleetStrip({ data }: { data: StaffDashboard }) {
  const { kpis } = data;
  const segments = [
    {
      label: 'Trucks in fleet',
      value: formatNumber(kpis.totalTrucks),
      hint: `${kpis.availableTrucks} available · ${kpis.maintenanceTrucks} in service`,
      icon: Truck,
      tone: 'bg-primary-soft text-primary',
      href: '/trucks',
    },
    {
      label: 'On the road',
      value: formatNumber(kpis.activeTrucks),
      hint: 'Assigned or mid-trip',
      icon: Route,
      tone: 'bg-success-soft text-success',
      href: '/trucks?status=IN_TRIP',
    },
    {
      label: 'Drivers',
      value: formatNumber(kpis.totalDrivers),
      hint: `${kpis.activeDrivers} active · ${kpis.invitedDrivers} invited`,
      icon: Steering,
      tone: 'bg-info-soft text-info',
      href: '/drivers',
    },
    {
      label: 'Active trips',
      value: formatNumber(kpis.activeTrips),
      hint: `${kpis.plannedTrips} planned · ${kpis.completedTrips} done`,
      icon: Package,
      tone: 'bg-warning-soft text-warning',
      href: '/trips?active=true',
    },
  ];

  return (
    <Stagger
      as="section"
      aria-label="Fleet summary"
      className="surface-card grid grid-cols-2 divide-border/70 overflow-hidden lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border/70 lg:[&>*:nth-child(-n+2)]:border-b-0"
    >
      {segments.map((segment) => (
        <motion.div key={segment.label} variants={riseItem}>
          <Link
            href={segment.href}
            className="group relative flex h-full items-center gap-3.5 p-5 transition-colors duration-200 hover:bg-muted/50 focus-ring"
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 [&_svg]:size-5',
                segment.tone,
              )}
            >
              <segment.icon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-muted-foreground">{segment.label}</span>
              <span className="block text-2xl font-semibold leading-tight tracking-tight">
                <CountUp value={segment.value} />
              </span>
              <span className="block truncate text-xs text-muted-foreground">{segment.hint}</span>
            </span>
            <ArrowRight className="size-[18px] shrink-0 -translate-x-2 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
          </Link>
        </motion.div>
      ))}
    </Stagger>
  );
}

/* -------------------------------------------------------------------- Live trips */

function LiveTrips({ data, className }: { data: StaffDashboard; className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Live trips</CardTitle>
          <CardDescription>The latest movements across the fleet</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/trips">
            All trips
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0">
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
          <Stagger as="div" className="divide-y divide-border/60 border-t border-border/60">
            {data.recentTrips.map((trip) => {
              const progress = TRIP_PROGRESS[trip.status] ?? 0;
              const cancelled = trip.status === 'CANCELLED';
              return (
                <motion.div key={trip.id} variants={riseItem}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="group relative grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3.5 transition-colors duration-200 hover:bg-muted/50 focus-ring"
                  >
                    <Avatar name={trip.driver?.name ?? '—'} color={trip.driver?.avatarColor} />
                    <div className="min-w-0 space-y-2">
                      <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                        <span className="font-semibold tabular">{trip.tripCode}</span>
                        <StatusBadge status={trip.status} size="sm" />
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                          {trip.driver?.name ?? 'No driver'} · {trip.truck?.truckNumber ?? 'No truck'}
                        </span>
                      </p>
                      {/* Route track: pickup → delivery with the trip's position. */}
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="flex min-w-0 max-w-[30%] items-center gap-1 text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span className="truncate">{trip.pickupLocation}</span>
                        </span>
                        <div className="relative h-1.5 flex-1 rounded-full bg-muted">
                          <motion.div
                            className={cn(
                              'absolute inset-y-0 left-0 rounded-full',
                              cancelled ? 'bg-destructive/40' : 'bg-gradient-to-r from-primary/50 to-primary',
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${cancelled ? 100 : progress}%` }}
                            transition={{ duration: 1, ease: EASE_OUT, delay: 0.25 }}
                          />
                          {!cancelled && progress > 0 && progress < 100 ? (
                            <motion.span
                              className="absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary ring-4 ring-primary/20"
                              initial={{ left: '0%' }}
                              animate={{ left: `${progress}%` }}
                              transition={{ duration: 1, ease: EASE_OUT, delay: 0.25 }}
                            >
                              </motion.span>
                          ) : null}
                        </div>
                        <span className="min-w-0 max-w-[30%] truncate text-muted-foreground">{trip.deliveryLocation}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular">{formatCurrency(trip.revenue)}</p>
                      <p className="text-[11.5px] text-muted-foreground">{formatDate(trip.startDate, 'd MMM')}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </Stagger>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- Attention + fleet */

function AttentionPanel({ data }: { data: StaffDashboard }) {
  const { kpis } = data;
  const items = [
    {
      count: kpis.pendingExpenseCount,
      label: 'Expense claims to review',
      detail: kpis.pendingExpenseCount ? `${formatCurrency(kpis.pendingExpenseAmount)} waiting` : 'All reviewed',
      icon: BadgeIndianRupee,
      tone: 'bg-warning-soft text-warning',
      href: '/expenses?status=PENDING',
    },
    {
      count: kpis.openBreakdowns,
      label: 'Open breakdowns',
      detail: kpis.openBreakdowns ? 'Trucks need roadside help' : 'Nothing on the roadside',
      icon: Accident,
      tone: 'bg-destructive-soft text-destructive',
      href: '/breakdowns',
    },
    {
      count: kpis.expiringDocuments,
      label: 'Documents expiring',
      detail: kpis.expiringDocuments ? 'Within the next 30 days' : 'Nothing due soon',
      icon: FileWarning,
      tone: 'bg-info-soft text-info',
      href: '/documents?expiring=30',
    },
  ];
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Needs attention</CardTitle>
        {total === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-4" /> All clear
          </span>
        ) : (
          <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-white tabular">{total}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors duration-200 hover:bg-muted/70 focus-ring"
          >
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', item.count ? item.tone : 'bg-muted text-muted-foreground')}>
              <item.icon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
            </span>
            <span className={cn('text-base font-semibold tabular', !item.count && 'text-muted-foreground/60')}>{item.count}</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function FleetStatusPanel({ data }: { data: StaffDashboard }) {
  const total = data.kpis.totalTrucks || data.fleetStatus.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Fleet status</CardTitle>
        <CardDescription>Where every truck is right now</CardDescription>
      </CardHeader>
      <CardContent>
        {data.fleetStatus.length === 0 || total === 0 ? (
          <EmptyState compact icon={<Truck />} title="No trucks yet" />
        ) : (
          <>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {data.fleetStatus.map((entry, index) =>
                entry.count > 0 ? (
                  <motion.div
                    key={entry.status}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ background: FLEET_COLORS[entry.status] ?? '#94A3B8' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(entry.count / total) * 100}%` }}
                    transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 + index * 0.07 }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 space-y-2.5">
              {data.fleetStatus.map((entry) => (
                <li key={entry.status} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-[4px]" style={{ background: FLEET_COLORS[entry.status] ?? '#94A3B8' }} />
                    {humanise(entry.status)}
                  </span>
                  <span className="tabular text-muted-foreground">
                    <span className="font-semibold text-foreground">{entry.count}</span> ·{' '}
                    {((entry.count / total) * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
