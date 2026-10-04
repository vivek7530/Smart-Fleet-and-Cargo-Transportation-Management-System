'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileText,
  Fuel,
  Gauge,
  Route,
  Truck as TruckIcon,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatCurrency, formatNumber, formatWeight } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { DocumentRecord, MaintenanceRecord, Trip, Truck } from '@/lib/types';
import { PageHeader } from '@/components/data/list-toolbar';
import { MiniStat } from '@/components/data/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryCell } from '@/components/data/expiry-cell';

interface AssignedTruck {
  truck: Truck;
  documents: DocumentRecord[];
  recentMaintenance: MaintenanceRecord[];
  activeTrip: Trip | null;
}

export default function MyTruckPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-truck'],
    queryFn: () => api.get<AssignedTruck | null>('/trucks/assigned/me'),
  });

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState description={(error as Error)?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-44 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data?.truck) {
    return (
      <div className="space-y-6">
        <PageHeader title="My truck" description="The vehicle you are responsible for." />
        <Card>
          <EmptyState
            icon={<TruckIcon />}
            title="No truck assigned yet"
            description="A manager will assign a truck to you before your next trip. It will appear here with its documents and service history."
          />
        </Card>
      </div>
    );
  }

  const { truck } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My truck"
        description="Everything about the vehicle you are responsible for."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/fuel">
                <Fuel />
                Record fuel
              </Link>
            </Button>
            <Button asChild variant="destructive-outline">
              <Link href="/breakdowns">
                <AlertTriangle />
                Report breakdown
              </Link>
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div
          className="relative border-b px-5 py-6"
          style={{
            backgroundImage:
              'radial-gradient(32rem 18rem at 12% 0%, hsl(var(--primary) / 0.10), transparent 65%)',
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <TruckIcon className="size-7" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-semibold tracking-tight tabular">{truck.truckNumber}</p>
              <p className="text-[13px] text-muted-foreground">
                {truck.make} {truck.model} · {truck.year}
              </p>
            </div>
            <StatusBadge status={truck.status} size="lg" />
          </div>
        </div>

        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MiniStat label="Capacity" value={formatWeight(truck.capacityTons)} />
            <MiniStat label="Odometer" value={`${formatNumber(truck.odometerKm)} km`} />
            <MiniStat label="Fuel type" value={humanise(truck.fuelType)} />
            <MiniStat
              label="Mileage"
              value={truck.mileageKmPerLitre ? `${truck.mileageKmPerLitre} km/L` : '—'}
            />
          </div>
        </CardContent>
      </Card>

      {data.activeTrip ? (
        <Card className="border-primary/30">
          <CardContent className="flex flex-wrap items-center gap-4 pt-5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Route className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <span className="tabular">{data.activeTrip.tripCode}</span>
                <StatusBadge status={data.activeTrip.status} size="sm" />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {data.activeTrip.pickupLocation} → {data.activeTrip.deliveryLocation}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={`/trips/${data.activeTrip.id}`}>
                Open trip
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              Documents
            </CardTitle>
            <CardDescription>Keep an eye on what is about to expire</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.documents.length === 0 ? (
              <EmptyState compact icon={<FileText />} title="No documents on file" />
            ) : (
              <ul className="divide-y divide-border/70">
                {data.documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{document.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {humanise(document.type)}
                        {document.referenceNumber ? ` · ${document.referenceNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ExpiryCell date={document.expiryDate} />
                      <StatusBadge status={document.status} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-muted-foreground" />
              Recent service
            </CardTitle>
            <CardDescription>What has been done to this vehicle lately</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentMaintenance.length === 0 ? (
              <EmptyState compact icon={<Gauge />} title="No service history yet" />
            ) : (
              <ul className="divide-y divide-border/70">
                {data.recentMaintenance.map((record) => (
                  <li key={record.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[13px] font-medium">
                          {humanise(record.type)}
                          <StatusBadge status={record.status} size="sm" />
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{record.description}</p>
                        {record.nextServiceDate ? (
                          <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
                            <CalendarClock className="size-3" />
                            Next service {formatDate(record.nextServiceDate)}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-semibold tabular">{formatCurrency(record.cost)}</p>
                        <p className="text-2xs text-muted-foreground">{formatDate(record.date)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        <ComplianceRow label="Insurance" date={truck.insuranceExpiry} provider={truck.insuranceProvider} />
        <ComplianceRow label="Fitness certificate" date={truck.fitnessExpiry} />
        <ComplianceRow label="Permit" date={truck.permitExpiry} />
      </div>
    </div>
  );
}

function ComplianceRow({
  label,
  date,
  provider,
}: {
  label: string;
  date?: string | null;
  provider?: string;
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1.5">
        <ExpiryCell date={date} />
      </div>
      {provider ? <p className="mt-1.5 truncate text-2xs text-muted-foreground">{provider}</p> : null}
    </div>
  );
}
