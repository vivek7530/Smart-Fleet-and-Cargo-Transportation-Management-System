'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BadgeIndianRupee,
  CircleDollarSign,
  FileText,
  Fuel,
  MapPin,
  Package,
  Pencil,
  Route,
  Truck as TruckIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatDistance, formatWeight } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type {
  DocumentRecord,
  DriverExpense,
  FuelRecord,
  TransportationCost,
  Trip,
} from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/data/list-toolbar';
import { MiniStat } from '@/components/data/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonStatGrid } from '@/components/ui/skeleton';
import { TripFormDialog } from '../trip-form';
import {
  CancelTripDialog,
  CompleteTripDialog,
  StartTripDialog,
  TripLifecycleActions,
} from '../trip-actions';

interface TripDetail {
  trip: Trip;
  expenses: DriverExpense[];
  transportationCosts: TransportationCost[];
  fuelRecords: FuelRecord[];
  documents: DocumentRecord[];
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [editOpen, setEditOpen] = React.useState(false);
  const [startOpen, setStartOpen] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState<Trip | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trip', params.id],
    queryFn: () => api.get<TripDetail>(`/trips/${params.id}`),
  });

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState title="Could not load this trip" description={(error as Error)?.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) return <TripDetailSkeleton />;

  const { trip } = data;
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canDrive = user?.role === 'DRIVER' && trip.driver?.id === user.id;
  const isClosed = ['COMPLETED', 'CANCELLED'].includes(trip.status);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft />
          Back
        </Button>

        <PageHeader
          title={trip.tripCode}
          description={
            <span className="flex flex-wrap items-center gap-1.5">
              <MapPin className="size-3.5" />
              {trip.pickupLocation}
              <ArrowRight className="size-3.5" />
              {trip.deliveryLocation}
              {trip.distanceKm ? <span className="text-muted-foreground">· {formatDistance(trip.distanceKm)}</span> : null}
            </span>
          }
          actions={
            <>
              <TripLifecycleActions
                trip={trip}
                canManage={canManage}
                canDrive={Boolean(canDrive)}
                onStart={() => setStartOpen(true)}
                onComplete={() => setCompleteOpen(true)}
              />
              {canManage && !isClosed ? (
                <>
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button variant="destructive-outline" onClick={() => setCancelTarget(trip)}>
                    <Ban />
                    Cancel
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={trip.status} />
            {trip.truck ? (
              <Link
                href={`/trucks/${trip.truck.id}`}
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <TruckIcon className="size-3.5" />
                <span className="tabular">{trip.truck.truckNumber}</span>
              </Link>
            ) : null}
            {trip.driver ? (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Avatar name={trip.driver.name} color={trip.driver.avatarColor} size="xs" />
                {trip.driver.name}
              </span>
            ) : null}
          </div>
        </PageHeader>
      </div>

      {trip.status === 'CANCELLED' && trip.cancelledReason ? (
        <div className="surface-card border-destructive/25 bg-destructive-soft/40 p-4 text-[13px]">
          <p className="font-medium text-destructive">This trip was cancelled</p>
          <p className="mt-0.5 text-muted-foreground">{trip.cancelledReason}</p>
        </div>
      ) : null}

      {/* Financials are a back-office concern. */}
      {canManage ? (
        <section className="grid gap-4 grid-auto-fit" aria-label="Trip financials">
          <FinanceTile label="Revenue" value={formatCurrency(trip.revenue)} tone="default" icon={<BadgeIndianRupee />} />
          <FinanceTile
            label="Total expenses"
            value={formatCurrency(trip.totalExpenses)}
            tone="warning"
            icon={<CircleDollarSign />}
            hint={`Fuel ${formatCurrency(trip.fuelCost)} · Costs ${formatCurrency(trip.transportationCost)}`}
          />
          <FinanceTile
            label="Driver expenses"
            value={formatCurrency(trip.driverExpenseTotal)}
            tone="info"
            icon={<Package />}
            hint="Approved claims only"
          />
          <FinanceTile
            label="Profit"
            value={formatCurrency(trip.profit)}
            tone={trip.profit >= 0 ? 'success' : 'danger'}
            icon={<Route />}
            hint={trip.revenue ? `${((trip.profit / trip.revenue) * 100).toFixed(1)}% margin` : undefined}
          />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Planned and actual dates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <MiniStat label="Start date" value={formatDate(trip.startDate)} />
              <MiniStat label="Expected delivery" value={formatDate(trip.expectedDeliveryDate)} />
              <MiniStat label="Started at" value={trip.startedAt ? formatDate(trip.startedAt) : '—'} />
              <MiniStat
                label="Delivered"
                value={trip.actualDeliveryDate ? formatDate(trip.actualDeliveryDate) : '—'}
              />
            </div>

            {trip.notes ? (
              <>
                <Separator />
                <div>
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{trip.notes}</p>
                </div>
              </>
            ) : null}

            <Separator />

            <div>
              <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lifecycle
              </p>
              <ol className="space-y-3">
                {trip.statusHistory?.map((event, index) => (
                  <li key={`${event.status}-${index}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 size-2 rounded-full bg-primary" />
                      {index < trip.statusHistory.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-[13px] font-medium">{humanise(event.status)}</p>
                      <p className="text-2xs text-muted-foreground">{formatDateTime(event.at)}</p>
                      {event.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.note}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <Tabs defaultValue="cargo">
              <TabsList>
                <TabsTrigger value="cargo">
                  <Package />
                  Cargo
                </TabsTrigger>
                <TabsTrigger value="expenses">
                  <BadgeIndianRupee />
                  Expenses
                </TabsTrigger>
                {canManage ? (
                  <TabsTrigger value="costs">
                    <CircleDollarSign />
                    Trip costs
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="fuel">
                  <Fuel />
                  Fuel
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <FileText />
                  Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cargo" className="mt-4">
                {!trip.cargo?.length ? (
                  <EmptyState compact icon={<Package />} title="No cargo attached to this trip" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {trip.cargo.map((item) => (
                      <li key={item.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[13px] font-medium">
                              <span className="tabular">{item.cargoCode}</span>
                              <StatusBadge status={item.status} size="sm" />
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                            <p className="mt-0.5 text-2xs text-muted-foreground">
                              {item.origin} → {item.destination}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[13px] font-semibold tabular">{formatWeight(item.weightTons)}</p>
                            <Badge variant="neutral" size="sm">
                              {humanise(item.type)}
                            </Badge>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="expenses" className="mt-4">
                {data.expenses.length === 0 ? (
                  <EmptyState compact icon={<BadgeIndianRupee />} title="No driver expenses on this trip" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.expenses.map((expense) => (
                      <li key={expense.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[13px] font-medium">
                            {humanise(expense.type)}
                            <StatusBadge status={expense.status} size="sm" />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {expense.description ?? 'No description'}
                          </p>
                          {expense.rejectionReason ? (
                            <p className="mt-0.5 text-2xs text-destructive">{expense.rejectionReason}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold tabular">{formatCurrency(expense.amount)}</p>
                          <p className="text-2xs text-muted-foreground">{formatDate(expense.date)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {canManage ? (
                <TabsContent value="costs" className="mt-4">
                  {data.transportationCosts.length === 0 ? (
                    <EmptyState compact icon={<CircleDollarSign />} title="No transportation costs recorded" />
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {data.transportationCosts.map((cost) => (
                        <li key={cost.id} className="flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium">{humanise(cost.type)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {cost.description ?? cost.vendor ?? '—'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[13px] font-semibold tabular">{formatCurrency(cost.amount)}</p>
                            <p className="text-2xs text-muted-foreground">{formatDate(cost.date)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              ) : null}

              <TabsContent value="fuel" className="mt-4">
                {data.fuelRecords.length === 0 ? (
                  <EmptyState compact icon={<Fuel />} title="No fuel logged for this trip" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.fuelRecords.map((record) => (
                      <li key={record.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">
                            {record.litres} L @ {formatCurrency(record.pricePerLitre, true)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {record.station ?? 'Fuel stop'} · {humanise(record.paymentMode)}
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
                  <EmptyState compact icon={<FileText />} title="No documents attached" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {data.documents.map((document) => (
                      <li key={document.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{document.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {humanise(document.type)}
                            {document.referenceNumber ? ` · ${document.referenceNumber}` : ''} ·{' '}
                            {formatDate(document.createdAt)}
                          </p>
                        </div>
                        <StatusBadge status={document.status} size="sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardContent />
        </Card>
      </div>

      {canManage ? (
        <>
          <TripFormDialog open={editOpen} onOpenChange={setEditOpen} trip={trip} />
          <CompleteTripDialog trip={trip} open={completeOpen} onOpenChange={setCompleteOpen} />
          <CancelTripDialog trip={cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)} />
        </>
      ) : null}
      <StartTripDialog trip={trip} open={startOpen} onOpenChange={setStartOpen} />
    </div>
  );
}

function FinanceTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon: React.ReactNode;
  hint?: string;
}) {
  const tones = {
    default: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-destructive-soft text-destructive',
    info: 'bg-info-soft text-info',
  };

  return (
    <div className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xl font-semibold tabular">{value}</p>
        </div>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]} [&_svg]:size-4`}>
          {icon}
        </span>
      </div>
      {hint ? <p className="mt-1.5 truncate text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TripDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonStatGrid count={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[28rem] rounded-xl" />
        <Skeleton className="h-[28rem] rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
