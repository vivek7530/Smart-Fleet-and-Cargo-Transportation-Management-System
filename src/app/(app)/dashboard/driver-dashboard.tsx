'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Fuel,
  IndianRupee,
  MapPin,
  Package,
  Route,
  Truck,
} from 'lucide-react';
import { formatCurrency, formatDate, formatNumber, formatWeight } from '@/lib/format';
import type { DriverDashboard } from '@/lib/types';
import { StatCard, MiniStat } from '@/components/data/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Separator } from '@/components/ui/misc';

/**
 * The driver view is deliberately compact and touch friendly — it is used on a
 * phone, often mid-journey.
 */
export function DriverDashboardView({ data }: { data: DriverDashboard }) {
  const { kpis, activeTrip, assignedTruck, upcomingTrips } = data;

  return (
    <div className="space-y-6">
      {activeTrip ? (
        <Card className="overflow-hidden border-primary/30">
          <div className="flex items-center gap-2 border-b border-primary/20 bg-primary-soft px-5 py-2.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Current trip</p>
            <StatusBadge status={activeTrip.status} size="sm" className="ml-auto" />
          </div>

          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tabular">{activeTrip.tripCode}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {activeTrip.pickupLocation}
                  <ArrowRight className="size-3.5" />
                  {activeTrip.deliveryLocation}
                </p>
              </div>
              <Button asChild size="sm">
                <Link href={`/trips/${activeTrip.id}`}>
                  Open trip
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MiniStat label="Truck" value={activeTrip.truck?.truckNumber ?? '—'} />
              <MiniStat label="Started" value={formatDate(activeTrip.startedAt ?? activeTrip.startDate)} />
              <MiniStat label="Due" value={formatDate(activeTrip.expectedDeliveryDate)} />
              <MiniStat
                label="Cargo"
                value={
                  activeTrip.cargo?.length
                    ? formatWeight(activeTrip.cargo.reduce((sum, item) => sum + item.weightTons, 0))
                    : '—'
                }
              />
            </div>

            {activeTrip.cargo?.length ? (
              <div className="rounded-lg border bg-muted/35 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Package className="size-3.5" />
                  Consignments
                </p>
                <ul className="space-y-1.5">
                  {activeTrip.cargo.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate">{item.description}</span>
                      <span className="shrink-0 tabular text-muted-foreground">
                        {formatWeight(item.weightTons)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Route />}
            title="No trip in progress"
            description="When a manager assigns you a trip it will appear here with everything you need."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/my-trips">View my trips</Link>
              </Button>
            }
          />
        </Card>
      )}

      <section className="grid gap-4 grid-auto-fit" aria-label="Your figures">
        <StatCard
          label="Completed trips"
          value={formatNumber(kpis.completedTrips)}
          icon={<CheckCircle2 />}
          tone="success"
          hint={`${kpis.totalTrips} trips in total`}
          href="/my-trips?status=COMPLETED"
        />
        <StatCard
          label="Upcoming trips"
          value={formatNumber(kpis.plannedTrips + kpis.activeTrips)}
          icon={<CalendarClock />}
          tone="info"
          hint={`${kpis.activeTrips} active now`}
          href="/my-trips"
        />
        <StatCard
          label="Expenses awaiting review"
          value={formatCurrency(kpis.pendingExpenseAmount)}
          icon={<Clock3 />}
          tone="warning"
          hint={`${kpis.pendingExpenseCount} claim${kpis.pendingExpenseCount === 1 ? '' : 's'} pending`}
          href="/expenses?status=PENDING"
        />
        <StatCard
          label="Approved expenses"
          value={formatCurrency(kpis.approvedExpenseAmount)}
          icon={<IndianRupee />}
          tone="success"
          hint={kpis.rejectedExpenseCount ? `${kpis.rejectedExpenseCount} rejected` : 'All claims settled'}
          href="/expenses?status=APPROVED"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>My truck</CardTitle>
              <CardDescription>The vehicle assigned to you</CardDescription>
            </div>
            {assignedTruck ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/my-truck">
                  Details
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {assignedTruck ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Truck className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tabular">{assignedTruck.truckNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {assignedTruck.make} {assignedTruck.model} · {assignedTruck.year}
                    </p>
                  </div>
                  <StatusBadge status={assignedTruck.status} className="ml-auto" />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <MiniStat label="Capacity" value={formatWeight(assignedTruck.capacityTons)} />
                  <MiniStat label="Odometer" value={`${formatNumber(assignedTruck.odometerKm)} km`} />
                  <MiniStat label="Fuel" value={assignedTruck.fuelType} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/fuel">
                      <Fuel />
                      Record fuel
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/breakdowns">
                      <AlertTriangle />
                      Report breakdown
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Truck />}
                title="No truck assigned"
                description="A manager will assign a truck to you before your next trip."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Coming up</CardTitle>
              <CardDescription>Your next scheduled trips</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/my-trips">
                All trips
                <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingTrips.length === 0 ? (
              <EmptyState compact icon={<CalendarClock />} title="Nothing scheduled" />
            ) : (
              <ul className="divide-y divide-border/70">
                {upcomingTrips.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/45"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          <span className="tabular">{trip.tripCode}</span>
                          <StatusBadge status={trip.status} size="sm" />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {trip.pickupLocation} → {trip.deliveryLocation}
                        </p>
                      </div>
                      <Badge variant="neutral" size="sm">
                        {formatDate(trip.startDate, 'd MMM')}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {kpis.openBreakdowns > 0 ? (
        <Link
          href="/breakdowns"
          className="surface-card flex items-center gap-3 border-destructive/25 bg-destructive-soft/50 p-4 transition-shadow hover:shadow-md"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
            <AlertTriangle className="size-4.5" />
          </span>
          <p className="flex-1 text-[13px]">
            You have <span className="font-semibold">{kpis.openBreakdowns}</span> breakdown report
            {kpis.openBreakdowns === 1 ? '' : 's'} still open.
          </p>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      ) : null}
    </div>
  );
}
