'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  IdCard,
  Phone,
  Route,
  Plus,
  Steering,
  Truck as TruckIcon,
  UserRound,
} from '@/components/icons';
import { api } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import type { MyFleetDriver, MyFleetReport, MyFleetTrip, MyFleetTruck } from '@/lib/types';
import { PageHeader } from '@/components/data/list-toolbar';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/data/stat-card';
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryCell } from '@/components/data/expiry-cell';
import { Stagger } from '@/components/motion/primitives';

/**
 * One manager's own corner of the fleet.
 *
 * Every list in this app is already ownership-scoped, so nothing here is newly
 * private — what is new is that the three answers sit together. A manager
 * opening this sees their trucks, their drivers and what is on the road right
 * now without crossing three screens, and never anybody else's.
 */
export default function MyFleetPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/managers/me/fleet'],
    queryFn: () => api.get<MyFleetReport>('/managers/me/fleet'),
  });

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState
          title="Could not load your fleet"
          description={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const { totals } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My fleet"
        description="The trucks you hold, the drivers on your roster and what is on the road right now."
        actions={
          <Button asChild>
            <Link href="/trucks">
              <Plus />
              Add a truck
            </Link>
          </Button>
        }
      />

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Trucks you hold"
          value={formatNumber(totals.trucks)}
          icon={<TruckIcon />}
          hint={totals.sharedTrucks > 0 ? `+ ${totals.sharedTrucks} shared with you` : 'Yours alone'}
        />
        <StatCard
          label="On the road"
          value={formatNumber(totals.trucksOnRoad)}
          icon={<Route />}
          tone="info"
          hint={`${formatNumber(totals.activeTrips)} trips running`}
        />
        <StatCard
          label="Your drivers"
          value={formatNumber(totals.drivers)}
          icon={<Steering />}
          tone="success"
          hint={`${formatNumber(totals.driversAvailable)} free right now`}
        />
        <StatCard
          label="Active trips"
          value={formatNumber(totals.activeTrips)}
          icon={<Route />}
          tone="warning"
          hint="Assigned, loading or in transit"
        />
      </Stagger>

      <Tabs defaultValue="trucks">
        <TabsList>
          <TabsTrigger value="trucks">
            <TruckIcon />
            Trucks ({formatNumber(data.trucks.length)})
          </TabsTrigger>
          <TabsTrigger value="drivers">
            <Steering />
            Drivers ({formatNumber(data.drivers.length)})
          </TabsTrigger>
          <TabsTrigger value="trips">
            <Route />
            Live trips ({formatNumber(data.trips.length)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trucks" className="mt-4">
          <TrucksPanel trucks={data.trucks} />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <DriversPanel drivers={data.drivers} />
        </TabsContent>

        <TabsContent value="trips" className="mt-4">
          <TripsPanel trips={data.trips} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TrucksPanel({ trucks }: { trucks: MyFleetTruck[] }) {
  if (trucks.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon={<TruckIcon />}
          title="No trucks yet"
          description="Trucks you add are yours automatically. An administrator can also hand one over or share one with you."
        />
      </div>
    );
  }

  return (
    <ul className="surface-card divide-y overflow-hidden">
      {trucks.map((truck) => (
        <li key={truck.id}>
          <Link
            href={`/trucks/${truck.id}`}
            className="focus-ring flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-[140px] flex-1">
              <p className="truncate font-medium tabular">{truck.truckNumber}</p>
              <p className="truncate text-xs text-muted-foreground tabular">{truck.registrationNumber}</p>
            </div>

            <div className="min-w-[130px] flex-1 text-sm">
              <p className="truncate">
                {truck.make} {truck.model}
              </p>
              <p className="text-xs text-muted-foreground tabular">
                {truck.year} · {truck.capacityTons} t
              </p>
            </div>

            <div className="min-w-[140px] flex-1">
              {truck.assignedDriver ? (
                <span className="flex items-center gap-2">
                  <Avatar name={truck.assignedDriver.name} color={truck.assignedDriver.avatarColor} size="xs" />
                  <span className="truncate text-sm">{truck.assignedDriver.name}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Steering className="size-3.5" />
                  No driver
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {truck.access !== 'OWNER' ? (
                <Badge variant="neutral" size="sm" title="This truck belongs to another manager">
                  shared · {truck.access.toLowerCase()}
                </Badge>
              ) : null}
              <StatusBadge status={truck.status} size="sm" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DriversPanel({ drivers }: { drivers: MyFleetDriver[] }) {
  if (drivers.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon={<UserRound />}
          title="No drivers on your roster"
          description="Invite a driver from the Drivers page — anyone you invite joins your roster, and only you and the administrators will see them."
        />
      </div>
    );
  }

  return (
    <ul className="surface-card divide-y overflow-hidden">
      {drivers.map((driver) => (
        <li key={driver.id}>
          <Link
            href={`/drivers/${driver.id}`}
            className="focus-ring flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex min-w-[180px] flex-1 items-center gap-3">
              <Avatar name={driver.name} color={driver.avatarColor} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{driver.name}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Phone className="size-3 shrink-0" />
                  <span className="tabular">{driver.mobile ?? driver.email ?? '—'}</span>
                </p>
              </div>
            </div>

            <div className="min-w-[130px] flex-1">
              {driver.assignedTruck ? (
                <span className="flex items-center gap-2 text-sm">
                  <TruckIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate tabular">{driver.assignedTruck.truckNumber}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No truck</span>
              )}
            </div>

            <div className="min-w-[140px] flex-1 space-y-0.5">
              <p className="flex items-center gap-1.5 truncate text-xs">
                <IdCard className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate tabular">{driver.licenseNumber ?? '—'}</span>
              </p>
              <ExpiryCell date={driver.licenseExpiry} />
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {driver.activeTripCount > 0 ? (
                <Badge variant="default" size="sm">
                  {driver.activeTripCount} active
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  free
                </Badge>
              )}
              <StatusBadge status={driver.status} size="sm" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TripsPanel({ trips }: { trips: MyFleetTrip[] }) {
  if (trips.length === 0) {
    return (
      <div className="surface-card">
        <EmptyState
          icon={<Route />}
          title="Nothing on the road"
          description="Trips that are assigned, loading or in transit appear here. Finished trips live on the Trips page."
        />
      </div>
    );
  }

  return (
    <ul className="surface-card divide-y overflow-hidden">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link
            href={`/trips/${trip.id}`}
            className="focus-ring flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-[120px] flex-1">
              <p className="truncate font-medium tabular">{trip.tripCode}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(trip.startDate, 'd MMM')} → {formatDate(trip.expectedDeliveryDate, 'd MMM')}
              </p>
            </div>

            <div className="min-w-[180px] flex-[1.4] text-sm">
              <p className="truncate">
                {trip.pickupLocation} <span className="text-muted-foreground">→</span> {trip.deliveryLocation}
              </p>
            </div>

            <div className="min-w-[140px] flex-1">
              {trip.driver ? (
                <span className="flex items-center gap-2">
                  <Avatar name={trip.driver.name} color={trip.driver.avatarColor} size="xs" />
                  <span className="truncate text-sm">{trip.driver.name}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No driver</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {trip.truck ? (
                <Badge variant="outline" size="sm" className="gap-1 tabular">
                  <TruckIcon />
                  {trip.truck.truckNumber}
                </Badge>
              ) : null}
              <StatusBadge status={trip.status} size="sm" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
