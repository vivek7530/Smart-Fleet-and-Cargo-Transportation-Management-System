'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  Fuel,
  Gauge,
  Pencil,
  Route,
  Truck as TruckIcon,
  Users,
  Wrench,
} from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber, formatWeight } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type {
  DocumentRecord,
  FuelRecord,
  MaintenanceRecord,
  Trip,
  Truck,
} from '@/lib/types';
import { PageHeader } from '@/components/data/list-toolbar';
import { MiniStat } from '@/components/data/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/auth-provider';
import { OdometerCorrectionDialog } from '@/components/data/odometer-correction';
import { useFleetFilterOptions } from '@/hooks/use-fleet-filters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonStatGrid } from '@/components/ui/skeleton';
import { TruckFormDialog } from '../truck-form';
import { ExpiryCell } from '@/components/data/expiry-cell';

interface TruckDetail {
  truck: Truck;
  recentTrips: Trip[];
  recentMaintenance: MaintenanceRecord[];
  recentFuel: FuelRecord[];
  documents: DocumentRecord[];
  totals: {
    totalTrips: number;
    totalRevenue: number;
    maintenanceCost: number;
    maintenanceCount: number;
    fuelCost: number;
    fuelLitres: number;
  };
}

export default function TruckDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [correctingOdometer, setCorrectingOdometer] = React.useState(false);
  const { user: viewer } = useAuth();
  const isStaff = viewer?.role === 'ADMIN' || viewer?.role === 'MANAGER';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['truck', params.id],
    queryFn: () => api.get<TruckDetail>(`/trucks/${params.id}`),
  });

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState
          title="Could not load this truck"
          description={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) return <TruckDetailSkeleton />;

  const { truck, totals } = data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft />
          Back
        </Button>

        <PageHeader
          title={truck.truckNumber}
          description={`${truck.make} ${truck.model} · ${truck.year}`}
          actions={
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit truck
            </Button>
          }
        >
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={truck.status} />
            {truck.assignedDriver ? (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Avatar name={truck.assignedDriver.name} color={truck.assignedDriver.avatarColor} size="xs" />
                {truck.assignedDriver.name}
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">No driver assigned</span>
            )}
          </div>
        </PageHeader>
      </div>

      <section className="grid gap-4 grid-auto-fit">
        <SummaryTile icon={<Route />} label="Trips" value={formatNumber(totals.totalTrips)} tone="info" />
        <SummaryTile
          icon={<TruckIcon />}
          label="Revenue generated"
          value={formatCurrency(totals.totalRevenue)}
          tone="success"
        />
        <SummaryTile
          icon={<Fuel />}
          label="Fuel spend"
          value={formatCurrency(totals.fuelCost)}
          hint={`${formatNumber(totals.fuelLitres)} litres`}
          tone="warning"
        />
        <SummaryTile
          icon={<Wrench />}
          label="Maintenance spend"
          value={formatCurrency(totals.maintenanceCost)}
          hint={`${totals.maintenanceCount} job${totals.maintenanceCount === 1 ? '' : 's'}`}
          tone="danger"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Vehicle</CardTitle>
            <CardDescription>Specification and compliance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* The plate repeats the truck number on most records here, so it only
                  earns a tile when it genuinely differs. */}
              {truck.registrationNumber !== truck.truckNumber ? (
                <MiniStat label="Registration" value={truck.registrationNumber} />
              ) : (
                <MiniStat label="Year" value={truck.year} />
              )}
              <MiniStat label="Capacity" value={formatWeight(truck.capacityTons)} />
              <div className="space-y-1">
                <MiniStat label="Odometer" value={`${formatNumber(truck.odometerKm)} km`} />
                {isStaff ? (
                  <button
                    type="button"
                    onClick={() => setCorrectingOdometer(true)}
                    className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Correct reading
                  </button>
                ) : null}
              </div>
              <MiniStat label="Fuel type" value={humanise(truck.fuelType)} />
              {truck.mileageKmPerLitre ? (
                <MiniStat label="Mileage" value={`${truck.mileageKmPerLitre} km/L`} />
              ) : null}
              <MiniStat label="Year" value={String(truck.year)} />
            </div>

            <Separator />

            <div className="space-y-2.5">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance</p>
              {[
                { label: 'Insurance', date: truck.insuranceExpiry },
                { label: 'Registration', date: truck.registrationExpiry },
                { label: 'Fitness', date: truck.fitnessExpiry },
                { label: 'Permit', date: truck.permitExpiry },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">{row.label}</span>
                  <ExpiryCell date={row.date} />
                </div>
              ))}
              {truck.insuranceProvider ? (
                <p className="pt-1 text-xs text-muted-foreground">
                  Insured with {truck.insuranceProvider}
                  {truck.insurancePolicyNumber ? ` · ${truck.insurancePolicyNumber}` : ''}
                </p>
              ) : null}
            </div>

            {truck.purchaseDate || truck.purchasePrice ? (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <MiniStat label="Purchased" value={formatDate(truck.purchaseDate)} />
                  <MiniStat label="Price" value={formatCurrency(truck.purchasePrice)} />
                </div>
                {truck.purchaseVendor ? (
                  <p className="text-xs text-muted-foreground">From {truck.purchaseVendor}</p>
                ) : null}
              </>
            ) : null}

            <Separator />

            <SharedWith truck={truck} />

            {truck.notes ? (
              <>
                <Separator />
                <p className="text-[13px] leading-relaxed text-muted-foreground">{truck.notes}</p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <Tabs defaultValue="trips">
              <TabsList>
                <TabsTrigger value="trips">
                  <Route />
                  Trips
                </TabsTrigger>
                <TabsTrigger value="maintenance">
                  <Wrench />
                  Maintenance
                </TabsTrigger>
                <TabsTrigger value="fuel">
                  <Fuel />
                  Fuel
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <FileText />
                  Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trips" className="mt-4">
                {data.recentTrips.length === 0 ? (
                  <EmptyState compact icon={<Route />} title="No trips for this truck yet" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.recentTrips.map((trip) => (
                      <li key={trip.id}>
                        <Link
                          href={`/trips/${trip.id}`}
                          className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/45"
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
                          <div className="text-right">
                            <p className="text-[13px] font-semibold tabular">{formatCurrency(trip.revenue)}</p>
                            <p className="text-2xs text-muted-foreground">{formatDate(trip.startDate)}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="mt-4">
                {data.recentMaintenance.length === 0 ? (
                  <EmptyState compact icon={<Wrench />} title="No maintenance recorded" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.recentMaintenance.map((record) => (
                      <li key={record.id} className="py-2.5">
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
              </TabsContent>

              <TabsContent value="fuel" className="mt-4">
                {data.recentFuel.length === 0 ? (
                  <EmptyState compact icon={<Fuel />} title="No fuel entries" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.recentFuel.map((record) => (
                      <li key={record.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">
                            {formatNumber(record.litres)} L @ {formatCurrency(record.pricePerLitre, true)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {record.station ?? 'Fuel stop'}
                            {record.odometerKm ? ` · ${formatNumber(record.odometerKm)} km` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold tabular">{formatCurrency(record.totalCost)}</p>
                          <p className="text-2xs text-muted-foreground">{formatDate(record.date)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                {data.documents.length === 0 ? (
                  <EmptyState compact icon={<FileText />} title="No documents uploaded" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.documents.map((document) => (
                      <li key={document.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{document.name}</p>
                          <p className="text-xs text-muted-foreground">{humanise(document.type)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ExpiryCell date={document.expiryDate} />
                          <StatusBadge status={document.status} size="sm" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4" />
        </Card>
      </div>

      <OdometerCorrectionDialog
        open={correctingOdometer}
        onOpenChange={setCorrectingOdometer}
        source="TRUCK"
        recordId={truck.id}
        currentKm={truck.odometerKm}
        invalidate={['truck']}
      />

      <TruckFormDialog open={editOpen} onOpenChange={setEditOpen} truck={truck} />
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
  };

  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]} [&_svg]:size-4.5`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-[15px] font-semibold tabular">{value}</p>
        {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function TruckDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-64" />
      </div>
      <SkeletonStatGrid count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

/**
 * The managers this truck is shared with, and — for an administrator — the
 * controls to change that.
 *
 * Sharing has been honoured on every read path since ownership landed, but
 * nothing could create a share, so the feature existed only in the access
 * rules. A manager sees who else is on the truck without being able to change
 * it: letting them share their own truck onward would let access spread
 * sideways with the wrong name in the audit trail.
 *
 * VIEW is spelled out rather than left to the badge, because the difference
 * between the two is money: a VIEW sharee gets the operational detail with the
 * figures stripped server-side.
 */
function SharedWith({ truck }: { truck: Truck }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const { managerOptions } = useFleetFilterOptions({ enabled: isAdmin });
  const shares = truck.sharedWith ?? [];

  const [adding, setAdding] = React.useState('NONE');
  const [permission, setPermission] = React.useState<'VIEW' | 'EDIT'>('VIEW');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['truck', truck.id] });
    queryClient.invalidateQueries({ queryKey: ['/trucks'] });
    queryClient.invalidateQueries({ queryKey: ['/trucks/by-manager'] });
  };

  const share = useMutation({
    mutationFn: (input: { user: string; permission: string }) =>
      api.post(`/trucks/${truck.id}/share`, input),
    onSuccess() {
      refresh();
      setAdding('NONE');
      toast.success('Truck shared');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not share this truck.')),
  });

  const unshare = useMutation({
    mutationFn: (userId: string) => api.delete(`/trucks/${truck.id}/share?user=${userId}`),
    onSuccess() {
      refresh();
      toast.success('Sharing stopped');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change this share.')),
  });

  // The owner is not a sharee, and neither is anyone already on the list.
  const choices = managerOptions.filter(
    (option) =>
      option.value !== 'ALL' &&
      option.value !== truck.owner?.id &&
      !shares.some((entry) => entry.user.id === option.value),
  );

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="size-3.5" />
        Shared with
      </p>

      {shares.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Only {truck.owner?.name ?? 'nobody'} can see this truck.
        </p>
      ) : (
        <ul className="space-y-2">
          {shares.map((entry) => (
            <li key={entry.user.id} className="flex items-center gap-2">
              <Avatar name={entry.user.name} color={entry.user.avatarColor} size="xs" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{entry.user.name}</span>
              <Badge variant={entry.permission === 'EDIT' ? 'info' : 'neutral'} size="sm">
                {entry.permission === 'EDIT' ? 'can edit' : 'view only'}
              </Badge>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  disabled={unshare.isPending}
                  onClick={() => unshare.mutate(entry.user.id)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && truck.owner ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={adding} onValueChange={setAdding} disabled={share.isPending || choices.length === 0}>
            <SelectTrigger className="h-8 w-auto min-w-[9.5rem] flex-1">
              <SelectValue placeholder={choices.length ? 'Add a manager' : 'Nobody left to add'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE" disabled>
                Add a manager
              </SelectItem>
              {choices.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={permission} onValueChange={(value) => setPermission(value as 'VIEW' | 'EDIT')}>
            <SelectTrigger className="h-8 w-auto min-w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VIEW">View only</SelectItem>
              <SelectItem value="EDIT">Can edit</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            disabled={adding === 'NONE' || share.isPending}
            loading={share.isPending}
            onClick={() => share.mutate({ user: adding, permission })}
          >
            Share
          </Button>
        </div>
      ) : null}

      {isAdmin && !truck.owner ? (
        <p className="text-xs text-muted-foreground">Give this truck an owner before sharing it.</p>
      ) : null}

      {isAdmin && shares.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          A view-only manager sees the truck and its trips with the figures removed.
        </p>
      ) : null}
    </div>
  );
}
