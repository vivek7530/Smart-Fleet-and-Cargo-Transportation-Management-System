'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus, Trash2, Truck as TruckIcon, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatNumber, formatWeight } from '@/lib/format';
import type { Truck } from '@/lib/types';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { TruckFormDialog } from './truck-form';
import { ExpiryCell } from '@/components/data/expiry-cell';

const TRUCK_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_TRIP', 'MAINTENANCE', 'INACTIVE'];
const FUEL_TYPES = ['DIESEL', 'PETROL', 'CNG', 'LNG', 'ELECTRIC'];

export default function TrucksPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['status', 'fuelType'] });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Truck | null>(null);
  const [deleting, setDeleting] = React.useState<Truck | null>(null);

  const query = useInfiniteList<Truck>({ path: '/trucks', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/trucks/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/trucks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Truck ${deleting?.truckNumber} deleted`);
      setDeleting(null);
    },
    onError(error) {
      toast.error(errorMessage(error, 'Could not delete this truck.'));
    },
  });

  const columns: Column<Truck>[] = [
    {
      key: 'truck',
      header: 'Truck',
      width: 'minmax(200px, 1.6fr)',
      sortKey: 'truckNumber',
      render: (truck) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <TruckIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium tabular">{truck.truckNumber}</p>
            <p className="truncate text-xs text-muted-foreground">
              {truck.make} {truck.model}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'status',
      render: (truck) => <StatusBadge status={truck.status} />,
    },
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(150px, 1.2fr)',
      hideBelow: 'lg',
      render: (truck) =>
        truck.assignedDriver ? (
          <div className="flex items-center gap-2">
            <Avatar name={truck.assignedDriver.name} color={truck.assignedDriver.avatarColor} size="xs" />
            <span className="truncate">{truck.assignedDriver.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      width: 'minmax(90px, 0.6fr)',
      sortKey: 'capacityTons',
      align: 'right',
      hideBelow: 'lg',
      render: (truck) => <span className="tabular">{formatWeight(truck.capacityTons)}</span>,
    },
    {
      key: 'odometer',
      header: 'Odometer',
      width: 'minmax(100px, 0.7fr)',
      sortKey: 'odometerKm',
      align: 'right',
      hideBelow: 'xl',
      render: (truck) => <span className="tabular">{formatNumber(truck.odometerKm)} km</span>,
    },
    {
      key: 'insurance',
      header: 'Insurance',
      width: 'minmax(110px, 0.8fr)',
      hideBelow: 'xl',
      render: (truck) => <ExpiryCell date={truck.insuranceExpiry} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trucks"
        description="Every vehicle in the fleet, with its driver, compliance dates and status."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add truck
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by number, make or model…"
        total={query.total}
        loadedCount={query.items.length}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(TRUCK_STATUSES, 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'fuelType',
            label: 'Fuel type',
            value: list.filters.fuelType ?? 'ALL',
            options: optionsFrom(FUEL_TYPES, 'All fuel types'),
            onChange: (value) => list.setFilter('fuelType', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(truck) => truck.id}
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
        onRowClick={(truck) => router.push(`/trucks/${truck.id}`)}
        emptyIcon={<TruckIcon />}
        emptyTitle={list.search || Object.keys(list.filters).length ? 'No trucks match your filters' : 'No trucks yet'}
        emptyDescription={
          list.search || Object.keys(list.filters).length
            ? 'Try a different search term or clear the filters.'
            : 'Add your first vehicle to start planning trips.'
        }
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add truck
          </Button>
        }
        mobileRow={(truck) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium tabular">{truck.truckNumber}</span>
              <StatusBadge status={truck.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              {truck.make} {truck.model} · {formatWeight(truck.capacityTons)}
            </p>
            <p className="text-xs text-muted-foreground">
              {truck.assignedDriver ? truck.assignedDriver.name : 'No driver assigned'}
            </p>
          </div>
        )}
        rowActions={(truck) => (
          <RowActions
            actions={[
              {
                label: 'View details',
                icon: <Eye />,
                onSelect: () => router.push(`/trucks/${truck.id}`),
              },
              {
                label: 'Edit truck',
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(truck);
                  setFormOpen(true);
                },
              },
              {
                label: 'Assign driver',
                icon: <UserRoundCog />,
                onSelect: () => {
                  setEditing(truck);
                  setFormOpen(true);
                },
              },
              {
                label: 'Delete',
                icon: <Trash2 />,
                variant: 'destructive',
                separatorBefore: true,
                onSelect: () => setDeleting(truck),
              },
            ]}
          />
        )}
      />

      <TruckFormDialog open={formOpen} onOpenChange={setFormOpen} truck={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete truck ${deleting?.truckNumber}?`}
        description="This permanently removes the vehicle. Trucks used by open trips cannot be deleted."
        confirmLabel="Delete truck"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}


