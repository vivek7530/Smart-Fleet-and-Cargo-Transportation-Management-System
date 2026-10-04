'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, IdCard, Mail, Phone, Route, Truck as TruckIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { Trip, Truck, UserRecord } from '@/lib/types';
import { PageHeader } from '@/components/data/list-toolbar';
import { MiniStat } from '@/components/data/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, Separator } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryCell } from '@/components/data/expiry-cell';

interface DriverDetail {
  driver: UserRecord;
  assignedTruck: Truck | null;
  recentTrips: Trip[];
}

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['driver', params.id],
    queryFn: () => api.get<DriverDetail>(`/drivers/${params.id}`),
  });

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState
          title="Could not load this driver"
          description={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-52" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const { driver, assignedTruck, recentTrips } = data;
  const completed = recentTrips.filter((trip) => trip.status === 'COMPLETED').length;
  const revenue = recentTrips.reduce((sum, trip) => sum + trip.revenue, 0);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft />
          Back
        </Button>

        <PageHeader title={driver.name} description={driver.designation ?? 'Driver'}>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={driver.status} />
            {driver.mobile ? (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Phone className="size-3.5" />
                <span className="tabular">{driver.mobile}</span>
              </span>
            ) : null}
            {driver.email ? (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Mail className="size-3.5" />
                {driver.email}
              </span>
            ) : null}
          </div>
        </PageHeader>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-3">
              <Avatar name={driver.name} color={driver.avatarColor} size="xl" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{driver.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  Joined {formatDate(driver.createdAt, 'MMM yyyy')}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <IdCard className="size-3.5" />
                Licence
              </p>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted-foreground">Number</span>
                <span className="tabular">{driver.licenseNumber ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted-foreground">Expiry</span>
                <ExpiryCell date={driver.licenseExpiry} />
              </div>
              {driver.experienceYears ? (
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">Experience</span>
                  <span>{driver.experienceYears} years</span>
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <MiniStat label="Recent trips" value={formatNumber(recentTrips.length)} />
              <MiniStat label="Completed" value={formatNumber(completed)} tone="success" />
              <MiniStat label="Revenue" value={formatCurrency(revenue)} />
              <MiniStat label="Role" value={humanise(driver.role)} tone="muted" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TruckIcon className="size-4 text-muted-foreground" />
                Assigned truck
              </CardTitle>
              <CardDescription>The vehicle this driver is responsible for</CardDescription>
            </CardHeader>
            <CardContent>
              {assignedTruck ? (
                <Link
                  href={`/trucks/${assignedTruck.id}`}
                  className="-m-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <TruckIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium tabular">{assignedTruck.truckNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {assignedTruck.make} {assignedTruck.model} · {formatNumber(assignedTruck.odometerKm)} km
                    </p>
                  </div>
                  <StatusBadge status={assignedTruck.status} />
                </Link>
              ) : (
                <EmptyState compact icon={<TruckIcon />} title="No truck assigned" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="size-4 text-muted-foreground" />
                Recent trips
              </CardTitle>
              <CardDescription>The last ten movements for this driver</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentTrips.length === 0 ? (
                <EmptyState compact icon={<Route />} title="No trips yet" />
              ) : (
                <ul className="divide-y divide-border/70">
                  {recentTrips.map((trip) => (
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
        </div>
      </div>
    </div>
  );
}
