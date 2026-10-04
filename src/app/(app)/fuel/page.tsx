'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Fuel, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { FuelRecord, Page, Trip, Truck } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/alert-dialog';

const PAYMENT_MODES = ['CASH', 'CARD', 'FUEL_CARD', 'CREDIT', 'UPI'] as const;

export default function FuelPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'date', filterKeys: ['paymentMode'] });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FuelRecord | null>(null);
  const [deleting, setDeleting] = React.useState<FuelRecord | null>(null);

  const query = useInfiniteList<FuelRecord>({ path: '/fuel', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/fuel/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/fuel'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Fuel record deleted');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this fuel record.')),
  });

  const columns: Column<FuelRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'date',
      render: (record) => <span className="tabular">{formatDate(record.date, 'd MMM yy')}</span>,
    },
    {
      key: 'truck',
      header: 'Truck',
      width: 'minmax(150px, 1fr)',
      render: (record) => (
        <div className="min-w-0">
          <p className="truncate font-medium tabular">{record.truck?.truckNumber ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{record.station ?? 'Fuel stop'}</p>
        </div>
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(140px, 1fr)',
      hideBelow: 'lg',
      render: (record) =>
        record.driver ? (
          <div className="flex items-center gap-2">
            <Avatar name={record.driver.name} color={record.driver.avatarColor} size="xs" />
            <span className="truncate">{record.driver.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'litres',
      header: 'Litres',
      width: 'minmax(90px, 0.6fr)',
      sortKey: 'litres',
      align: 'right',
      render: (record) => <span className="tabular">{formatNumber(record.litres)} L</span>,
    },
    {
      key: 'rate',
      header: 'Rate',
      width: 'minmax(90px, 0.6fr)',
      align: 'right',
      hideBelow: 'xl',
      render: (record) => <span className="tabular">{formatCurrency(record.pricePerLitre, true)}</span>,
    },
    {
      key: 'trip',
      header: 'Trip',
      width: 'minmax(100px, 0.6fr)',
      hideBelow: 'lg',
      render: (record) =>
        record.trip ? <span className="tabular">{record.trip.tripCode}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'total',
      header: 'Total',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'totalCost',
      align: 'right',
      render: (record) => <span className="font-semibold tabular">{formatCurrency(record.totalCost)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fuel"
        description={isStaff ? 'Every fuel purchase across the fleet.' : 'The fuel you have recorded for your truck.'}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Record fuel
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by station or location…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'paymentMode',
            label: 'Payment',
            value: list.filters.paymentMode ?? 'ALL',
            options: optionsFrom(PAYMENT_MODES as unknown as string[], 'All payment modes'),
            onChange: (value) => list.setFilter('paymentMode', value),
            primary: true,
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(record) => record.id}
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
        emptyIcon={<Fuel />}
        emptyTitle="No fuel records yet"
        emptyDescription="Log a refuelling stop to keep trip costs accurate."
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Record fuel
          </Button>
        }
        mobileRow={(record) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium tabular">{record.truck?.truckNumber ?? '—'}</span>
              <span className="font-semibold tabular">{formatCurrency(record.totalCost)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(record.litres)} L @ {formatCurrency(record.pricePerLitre, true)} ·{' '}
              {formatDate(record.date)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{record.station ?? 'Fuel stop'}</p>
          </div>
        )}
        rowActions={
          isStaff
            ? (record) => (
                <RowActions
                  actions={[
                    {
                      label: 'Edit record',
                      icon: <Pencil />,
                      onSelect: () => {
                        setEditing(record);
                        setFormOpen(true);
                      },
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 />,
                      variant: 'destructive',
                      separatorBefore: true,
                      onSelect: () => setDeleting(record),
                    },
                  ]}
                />
              )
            : undefined
        }
      />

      <FuelFormDialog open={formOpen} onOpenChange={setFormOpen} record={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this fuel record?"
        description="The trip's fuel cost will be recalculated without it."
        confirmLabel="Delete record"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

const fuelSchema = z.object({
  truck: z.string().min(1, 'Choose the truck that was refuelled'),
  trip: z.string().optional(),
  date: z.string().min(1, 'Choose the date'),
  litres: z.coerce.number({ invalid_type_error: 'Enter the litres filled' }).min(0.1, 'Litres must be greater than zero'),
  pricePerLitre: z.coerce
    .number({ invalid_type_error: 'Enter the price per litre' })
    .min(0.1, 'Price per litre must be greater than zero'),
  odometerKm: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  station: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
  paymentMode: z.enum(PAYMENT_MODES),
  notes: z.string().trim().max(1000).optional(),
});

type FuelValues = z.infer<typeof fuelSchema>;

function FuelFormDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: FuelRecord | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isDriver = user?.role === 'DRIVER';
  const isEdit = Boolean(record);

  const form = useForm<FuelValues>({
    resolver: zodResolver(fuelSchema),
    defaultValues: {
      truck: '',
      trip: 'NONE',
      date: toDateInput(new Date()),
      litres: 0,
      pricePerLitre: 0,
      odometerKm: '',
      station: '',
      location: '',
      paymentMode: 'FUEL_CARD',
      notes: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof FuelValues>((field, message) =>
    form.setError(field, { message }),
  );

  // A driver may only log fuel against the truck assigned to them.
  const { data: assignedTruck } = useQuery({
    queryKey: ['my-truck'],
    queryFn: () => api.get<{ truck: Truck } | null>('/trucks/assigned/me'),
    enabled: open && isDriver,
  });

  const { data: trucks } = useQuery({
    queryKey: ['trucks', 'picker'],
    queryFn: () => api.get<Page<Truck>>('/trucks', { limit: 100 }),
    enabled: open && !isDriver,
    staleTime: 30_000,
  });

  const { data: trips } = useQuery({
    queryKey: ['trips', 'picker-active'],
    queryFn: () => api.get<Page<Trip>>('/trips', { limit: 50, active: 'true' }),
    enabled: open,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);

    if (record) {
      form.reset({
        truck: record.truck?.id ?? '',
        trip: record.trip?.id ?? 'NONE',
        date: toDateInput(record.date),
        litres: record.litres,
        pricePerLitre: record.pricePerLitre,
        odometerKm: record.odometerKm ?? '',
        station: record.station ?? '',
        location: record.location ?? '',
        paymentMode: record.paymentMode,
        notes: record.notes ?? '',
      });
    } else {
      form.reset({
        truck: isDriver ? (assignedTruck?.truck?.id ?? '') : '',
        trip: 'NONE',
        date: toDateInput(new Date()),
        litres: 0,
        pricePerLitre: 0,
        odometerKm: '',
        station: '',
        location: '',
        paymentMode: 'FUEL_CARD',
        notes: '',
      });
    }
  }, [open, record, isDriver, assignedTruck, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: FuelValues) => {
      const payload = {
        ...values,
        trip: values.trip === 'NONE' ? null : values.trip,
        odometerKm: values.odometerKm === '' ? undefined : values.odometerKm,
        date: new Date(values.date).toISOString(),
      };
      return isEdit
        ? api.patch<{ fuelRecord: FuelRecord }>(`/fuel/${record!.id}`, payload)
        : api.post<{ fuelRecord: FuelRecord }>('/fuel', payload);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/fuel'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['trip'] });
      toast.success(isEdit ? 'Fuel record updated' : 'Fuel recorded');
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;
  const litres = Number(form.watch('litres')) || 0;
  const price = Number(form.watch('pricePerLitre')) || 0;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit fuel record' : 'Record fuel'}
      description="Fuel logged against a trip is included in that trip's cost."
      submitLabel={isEdit ? 'Save changes' : 'Record fuel'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
      footerExtra={
        litres > 0 && price > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Total: <span className="font-semibold text-foreground tabular">{formatCurrency(litres * price)}</span>
          </p>
        ) : null
      }
    >
      <FormGrid>
        <FormField label="Truck" required error={errors.truck?.message}>
          {isDriver ? (
            <Input value={assignedTruck?.truck?.truckNumber ?? 'No truck assigned'} readOnly disabled />
          ) : (
            <Select value={form.watch('truck')} onValueChange={(value) => form.setValue('truck', value)}>
              <SelectTrigger invalid={Boolean(errors.truck)}>
                <SelectValue placeholder="Choose a truck" />
              </SelectTrigger>
              <SelectContent>
                {trucks?.items.map((truck) => (
                  <SelectItem key={truck.id} value={truck.id}>
                    {truck.truckNumber} · {truck.make} {truck.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label="Trip" hint="Optional — links the cost to a trip.">
          <Select value={form.watch('trip') || 'NONE'} onValueChange={(value) => form.setValue('trip', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Not linked to a trip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Not linked to a trip</SelectItem>
              {trips?.items.map((trip) => (
                <SelectItem key={trip.id} value={trip.id}>
                  {trip.tripCode} · {trip.pickupLocation} → {trip.deliveryLocation}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Date" htmlFor="fuel-date" required error={errors.date?.message}>
          <Input id="fuel-date" type="date" invalid={Boolean(errors.date)} {...form.register('date')} />
        </FormField>

        <FormField label="Payment mode">
          <Select
            value={form.watch('paymentMode')}
            onValueChange={(value) => form.setValue('paymentMode', value as FuelValues['paymentMode'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {humanise(mode)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Litres" htmlFor="litres" required error={errors.litres?.message}>
          <Input id="litres" type="number" step="0.1" invalid={Boolean(errors.litres)} {...form.register('litres')} />
        </FormField>

        <FormField label="Price per litre (₹)" htmlFor="pricePerLitre" required error={errors.pricePerLitre?.message}>
          <Input
            id="pricePerLitre"
            type="number"
            step="0.01"
            invalid={Boolean(errors.pricePerLitre)}
            {...form.register('pricePerLitre')}
          />
        </FormField>

        <FormField label="Odometer (km)" htmlFor="odometerKm">
          <Input id="odometerKm" type="number" {...form.register('odometerKm')} />
        </FormField>

        <FormField label="Station" htmlFor="station">
          <Input id="station" placeholder="Indian Oil — NH48" {...form.register('station')} />
        </FormField>
      </FormGrid>

      <FormField label="Notes" htmlFor="fuel-notes">
        <Textarea id="fuel-notes" rows={2} {...form.register('notes')} />
      </FormField>
    </ResourceDialog>
  );
}
