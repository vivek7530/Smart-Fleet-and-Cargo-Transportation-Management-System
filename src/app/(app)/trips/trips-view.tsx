'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Eye, MapPin, Pencil, Plus, Route, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Trip } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { TripFormDialog } from './trip-form';
import { CancelTripDialog } from './trip-actions';

const TRIP_STATUSES = ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

/** Shared by /trips (staff) and /my-trips (driver). */
export function TripsView({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'startDate', filterKeys: ['status', 'active'] });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Trip | null>(null);
  const [cancelling, setCancelling] = React.useState<Trip | null>(null);
  const [deleting, setDeleting] = React.useState<Trip | null>(null);

  const query = useInfiniteList<Trip>({ path: '/trips', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/trips/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/trips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Trip ${deleting?.tripCode} deleted`);
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this trip.')),
  });

  const columns: Column<Trip>[] = [
    {
      key: 'trip',
      header: 'Trip',
      width: 'minmax(210px, 1.6fr)',
      sortKey: 'tripCode',
      render: (trip) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="tabular">{trip.tripCode}</span>
            <StatusBadge status={trip.status} size="sm" />
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {trip.pickupLocation} → {trip.deliveryLocation}
          </p>
        </div>
      ),
    },
    {
      key: 'truck',
      header: 'Truck',
      width: 'minmax(120px, 0.9fr)',
      hideBelow: 'lg',
      render: (trip) =>
        trip.truck ? (
          <span className="tabular">{trip.truck.truckNumber}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(150px, 1.1fr)',
      hideBelow: 'lg',
      render: (trip) =>
        trip.driver ? (
          <div className="flex items-center gap-2">
            <Avatar name={trip.driver.name} color={trip.driver.avatarColor} size="xs" />
            <span className="truncate">{trip.driver.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'dates',
      header: 'Schedule',
      width: 'minmax(130px, 0.9fr)',
      sortKey: 'startDate',
      hideBelow: 'md',
      render: (trip) => (
        <div className="text-xs">
          <p className="tabular">{formatDate(trip.startDate, 'd MMM yy')}</p>
          <p className="text-muted-foreground">due {formatDate(trip.expectedDeliveryDate, 'd MMM')}</p>
        </div>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      width: 'minmax(110px, 0.8fr)',
      sortKey: 'revenue',
      align: 'right',
      hideBelow: 'md',
      render: (trip) => <span className="tabular font-medium">{formatCurrency(trip.revenue)}</span>,
    },
    {
      key: 'profit',
      header: 'Profit',
      width: 'minmax(110px, 0.8fr)',
      align: 'right',
      hideBelow: 'xl',
      render: (trip) => (
        <span className={`tabular font-medium ${trip.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
          {formatCurrency(trip.profit)}
        </span>
      ),
    },
  ];

  // Drivers do not see the money columns.
  const visibleColumns = isStaff ? columns : columns.filter((column) => !['revenue', 'profit'].includes(column.key));

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        actions={
          isStaff ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Create trip
            </Button>
          ) : null
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by trip code or route…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(TRIP_STATUSES, 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'active',
            label: 'On the road',
            value: list.filters.active ?? 'ALL',
            options: [
              { label: 'All trips', value: 'ALL' },
              { label: 'Active only', value: 'true' },
            ],
            onChange: (value) => list.setFilter('active', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={visibleColumns}
        getRowId={(trip) => trip.id}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={query.fetchNextPage}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSortChange={list.setSort}
        onRowClick={(trip) => router.push(`/trips/${trip.id}`)}
        emptyIcon={<Route />}
        emptyTitle={list.search || Object.keys(list.filters).length ? 'No trips match your filters' : 'No trips yet'}
        emptyDescription={
          isStaff
            ? 'Create a trip to assign a truck, a driver and the cargo it will carry.'
            : 'Trips assigned to you will appear here.'
        }
        emptyAction={
          isStaff ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Create trip
            </Button>
          ) : undefined
        }
        mobileRow={(trip) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium tabular">{trip.tripCode}</span>
              <StatusBadge status={trip.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              {trip.pickupLocation} → {trip.deliveryLocation}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(trip.startDate)} · {trip.truck?.truckNumber ?? 'No truck'}
              {isStaff ? ` · ${formatCurrency(trip.revenue)}` : ''}
            </p>
          </div>
        )}
        rowActions={(trip) => (
          <RowActions
            actions={[
              { label: 'View details', icon: <Eye />, onSelect: () => router.push(`/trips/${trip.id}`) },
              {
                label: 'Edit trip',
                icon: <Pencil />,
                hidden: !isStaff || ['COMPLETED', 'CANCELLED'].includes(trip.status),
                onSelect: () => {
                  setEditing(trip);
                  setFormOpen(true);
                },
              },
              {
                label: 'Cancel trip',
                icon: <Ban />,
                variant: 'destructive',
                separatorBefore: true,
                hidden: !isStaff || ['COMPLETED', 'CANCELLED'].includes(trip.status),
                onSelect: () => setCancelling(trip),
              },
              {
                label: 'Delete trip',
                icon: <Trash2 />,
                variant: 'destructive',
                hidden: !isStaff || !['PLANNED', 'CANCELLED'].includes(trip.status),
                onSelect: () => setDeleting(trip),
              },
            ]}
          />
        )}
      />

      {isStaff ? (
        <>
          <TripFormDialog open={formOpen} onOpenChange={setFormOpen} trip={editing} />
          <CancelTripDialog trip={cancelling} onOpenChange={(open) => !open && setCancelling(null)} />
          <ConfirmDialog
            open={Boolean(deleting)}
            onOpenChange={(open) => !open && setDeleting(null)}
            title={`Delete trip ${deleting?.tripCode}?`}
            description="This permanently removes the trip and releases its cargo. Only planned or cancelled trips can be deleted."
            confirmLabel="Delete trip"
            loading={remove.isPending}
            onConfirm={() => deleting && remove.mutate(deleting.id)}
          />
        </>
      ) : null}
    </div>
  );
}

