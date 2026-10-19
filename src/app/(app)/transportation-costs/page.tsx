'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleDollarSign, Pencil, Plus, Trash2 } from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { Page, TransportationCost, Trip } from '@/lib/types';
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
import { ConfirmDialog } from '@/components/ui/alert-dialog';

const COST_TYPES = [
  'TOLL',
  'PERMIT',
  'LOADING',
  'UNLOADING',
  'WEIGHBRIDGE',
  'ESCORT',
  'PARKING',
  'BROKERAGE',
  'OTHER',
] as const;

export default function TransportationCostsPage() {
  const queryClient = useQueryClient();
  const list = useListState({ defaultSort: 'date', filterKeys: ['type'] });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransportationCost | null>(null);
  const [deleting, setDeleting] = React.useState<TransportationCost | null>(null);

  const query = useInfiniteList<TransportationCost>({ path: '/transportation-costs', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/transportation-costs/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/transportation-costs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Cost entry deleted');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this entry.')),
  });

  const columns: Column<TransportationCost>[] = [
    {
      key: 'cost',
      header: 'Cost',
      width: 'minmax(220px, 1.8fr)',
      render: (cost) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CircleDollarSign className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{humanise(cost.type)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {cost.description ?? cost.vendor ?? 'No description'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'trip',
      header: 'Trip',
      width: 'minmax(170px, 1.2fr)',
      hideBelow: 'md',
      render: (cost) => (
        <div className="min-w-0">
          <p className="truncate tabular">{cost.trip?.tripCode ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {cost.trip ? `${cost.trip.pickupLocation} → ${cost.trip.deliveryLocation}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      width: 'minmax(140px, 1fr)',
      hideBelow: 'xl',
      render: (cost) => <span className="truncate text-muted-foreground">{cost.vendor ?? '—'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'date',
      hideBelow: 'lg',
      render: (cost) => <span className="tabular">{formatDate(cost.date, 'd MMM yy')}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'amount',
      align: 'right',
      render: (cost) => <span className="font-semibold tabular">{formatCurrency(cost.amount)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trip costs"
        description="Tolls, permits, handling and brokerage — everything charged against a trip."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add cost
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by description or vendor…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'type',
            label: 'Cost type',
            value: list.filters.type ?? 'ALL',
            options: optionsFrom(COST_TYPES as unknown as string[], 'All cost types'),
            onChange: (value) => list.setFilter('type', value),
            primary: true,
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(cost) => cost.id}
        isLoading={query.isLoading}
        isRefetching={query.isRefetching}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={query.fetchNextPage}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSortChange={list.setSort}
        emptyIcon={<CircleDollarSign />}
        emptyTitle="No trip costs recorded"
        emptyDescription="Add tolls, permits and handling charges so trip profit stays accurate."
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add cost
          </Button>
        }
        mobileRow={(cost) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{humanise(cost.type)}</span>
              <span className="font-semibold tabular">{formatCurrency(cost.amount)}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{cost.description ?? cost.vendor}</p>
            <p className="text-xs text-muted-foreground">
              {cost.trip?.tripCode} · {formatDate(cost.date)}
            </p>
          </div>
        )}
        rowActions={(cost) => (
          <RowActions
            actions={[
              {
                label: 'Edit entry',
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(cost);
                  setFormOpen(true);
                },
              },
              {
                label: 'Delete',
                icon: <Trash2 />,
                variant: 'destructive',
                separatorBefore: true,
                onSelect: () => setDeleting(cost),
              },
            ]}
          />
        )}
      />

      <CostFormDialog open={formOpen} onOpenChange={setFormOpen} cost={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this cost entry?"
        description="The trip's cost total and profit will be recalculated."
        confirmLabel="Delete entry"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

const costSchema = z.object({
  trip: z.string().min(1, 'Choose the trip this cost belongs to'),
  type: z.enum(COST_TYPES),
  amount: z.coerce.number({ invalid_type_error: 'Enter the amount' }).min(0, 'Amount cannot be negative'),
  date: z.string().min(1, 'Choose the date'),
  description: z.string().trim().max(1000).optional(),
  vendor: z.string().trim().max(160).optional(),
});

type CostValues = z.infer<typeof costSchema>;

function CostFormDialog({
  open,
  onOpenChange,
  cost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cost?: TransportationCost | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(cost);

  const form = useForm<CostValues>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      trip: '',
      type: 'TOLL',
      amount: 0,
      date: toDateInput(new Date()),
      description: '',
      vendor: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof CostValues>((field, message) =>
    form.setError(field, { message }),
  );

  const { data: trips } = useQuery({
    queryKey: ['trips', 'picker-open'],
    queryFn: () => api.get<Page<Trip>>('/trips', { limit: 50 }),
    enabled: open,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    form.reset(
      cost
        ? {
            trip: cost.trip?.id ?? '',
            type: cost.type,
            amount: cost.amount,
            date: toDateInput(cost.date),
            description: cost.description ?? '',
            vendor: cost.vendor ?? '',
          }
        : {
            trip: '',
            type: 'TOLL',
            amount: 0,
            date: toDateInput(new Date()),
            description: '',
            vendor: '',
          },
    );
  }, [open, cost, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: CostValues) => {
      const payload = { ...values, date: new Date(values.date).toISOString() };
      return isEdit
        ? api.patch(`/transportation-costs/${cost!.id}`, payload)
        : api.post('/transportation-costs', payload);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/transportation-costs'] });
      queryClient.invalidateQueries({ queryKey: ['trip'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Cost entry updated' : 'Cost added to the trip');
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit cost entry' : 'Add a trip cost'}
      description="Costs recorded here roll straight into the trip's profit calculation."
      submitLabel={isEdit ? 'Save changes' : 'Add cost'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      <FormField label="Trip" required error={errors.trip?.message}>
        <Select value={form.watch('trip')} onValueChange={(value) => form.setValue('trip', value)}>
          <SelectTrigger invalid={Boolean(errors.trip)}>
            <SelectValue placeholder="Choose a trip" />
          </SelectTrigger>
          <SelectContent>
            {trips?.items.map((trip) => (
              <SelectItem key={trip.id} value={trip.id}>
                {trip.tripCode} · {trip.pickupLocation} → {trip.deliveryLocation}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormGrid>
        <FormField label="Cost type" required>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as CostValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COST_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanise(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Amount (₹)" htmlFor="cost-amount" required error={errors.amount?.message}>
          <Input id="cost-amount" type="number" invalid={Boolean(errors.amount)} {...form.register('amount')} />
        </FormField>

        <FormField label="Date" htmlFor="cost-date" required error={errors.date?.message}>
          <Input id="cost-date" type="date" invalid={Boolean(errors.date)} {...form.register('date')} />
        </FormField>

        <FormField label="Vendor" htmlFor="cost-vendor">
          <Input id="cost-vendor" placeholder="Highway authority" {...form.register('vendor')} />
        </FormField>
      </FormGrid>

      <FormField label="Description" htmlFor="cost-description">
        <Textarea id="cost-description" rows={2} placeholder="Highway toll charges for the route" {...form.register('description')} />
      </FormField>
    </ResourceDialog>
  );
}
