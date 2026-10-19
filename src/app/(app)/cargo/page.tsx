'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package, Pencil, Plus, Trash2 } from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatWeight } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { Cargo } from '@/lib/types';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField, FormGrid, FormSection } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';

const CARGO_TYPES = [
  'GENERAL',
  'PERISHABLE',
  'FRAGILE',
  'HAZARDOUS',
  'LIQUID',
  'REFRIGERATED',
  'OVERSIZED',
  'CONTAINER',
] as const;
const CARGO_STATUSES = ['PENDING', 'ASSIGNED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

export default function CargoPage() {
  const queryClient = useQueryClient();
  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['status', 'type', 'unassigned'] });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Cargo | null>(null);
  const [deleting, setDeleting] = React.useState<Cargo | null>(null);

  const query = useInfiniteList<Cargo>({ path: '/cargo', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/cargo/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/cargo'] });
      toast.success(`Cargo ${deleting?.cargoCode} deleted`);
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this cargo record.')),
  });

  const columns: Column<Cargo>[] = [
    {
      key: 'cargo',
      header: 'Cargo',
      width: 'minmax(220px, 1.8fr)',
      sortKey: 'cargoCode',
      render: (cargo) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Package className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="tabular">{cargo.cargoCode}</span>
              <Badge variant="neutral" size="sm">
                {humanise(cargo.type)}
              </Badge>
            </p>
            <p className="truncate text-xs text-muted-foreground">{cargo.description}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      width: 'minmax(170px, 1.2fr)',
      hideBelow: 'lg',
      render: (cargo) => (
        <p className="truncate text-xs">
          {cargo.origin}
          <span className="mx-1 text-muted-foreground">→</span>
          {cargo.destination}
        </p>
      ),
    },
    {
      key: 'weight',
      header: 'Weight',
      width: 'minmax(90px, 0.6fr)',
      sortKey: 'weightTons',
      align: 'right',
      render: (cargo) => <span className="tabular">{formatWeight(cargo.weightTons)}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'declaredValue',
      align: 'right',
      hideBelow: 'xl',
      render: (cargo) => <span className="tabular">{formatCurrency(cargo.declaredValue)}</span>,
    },
    {
      key: 'trip',
      header: 'Trip',
      width: 'minmax(110px, 0.7fr)',
      hideBelow: 'lg',
      render: (cargo) =>
        cargo.trip ? (
          <span className="tabular">{cargo.trip.tripCode}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'status',
      render: (cargo) => <StatusBadge status={cargo.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cargo"
        description="Consignments waiting to move and those already on the road."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Register cargo
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by code, shipper, consignee or route…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(CARGO_STATUSES, 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'type',
            label: 'Cargo type',
            value: list.filters.type ?? 'ALL',
            options: optionsFrom(CARGO_TYPES as unknown as string[], 'All types'),
            onChange: (value) => list.setFilter('type', value),
          },
          {
            key: 'unassigned',
            label: 'Assignment',
            value: list.filters.unassigned ?? 'ALL',
            options: [
              { label: 'All cargo', value: 'ALL' },
              { label: 'Not on a trip', value: 'true' },
            ],
            onChange: (value) => list.setFilter('unassigned', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(cargo) => cargo.id}
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
        onRowClick={(cargo) => {
          setEditing(cargo);
          setFormOpen(true);
        }}
        emptyIcon={<Package />}
        emptyTitle="No cargo registered"
        emptyDescription="Register a consignment so it can be attached to a trip."
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Register cargo
          </Button>
        }
        mobileRow={(cargo) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium tabular">{cargo.cargoCode}</span>
              <StatusBadge status={cargo.status} size="sm" />
            </div>
            <p className="truncate text-xs text-muted-foreground">{cargo.description}</p>
            <p className="text-xs text-muted-foreground">
              {cargo.origin} → {cargo.destination} · {formatWeight(cargo.weightTons)}
            </p>
          </div>
        )}
        rowActions={(cargo) => (
          <RowActions
            actions={[
              {
                label: 'Edit cargo',
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(cargo);
                  setFormOpen(true);
                },
              },
              {
                label: 'Delete',
                icon: <Trash2 />,
                variant: 'destructive',
                separatorBefore: true,
                onSelect: () => setDeleting(cargo),
              },
            ]}
          />
        )}
      />

      <CargoFormDialog open={formOpen} onOpenChange={setFormOpen} cargo={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete cargo ${deleting?.cargoCode}?`}
        description="Cargo already loaded or in transit cannot be deleted."
        confirmLabel="Delete cargo"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

const cargoSchema = z.object({
  description: z.string().trim().min(3, 'Describe the cargo').max(500),
  type: z.enum(CARGO_TYPES),
  weightTons: z.coerce.number({ invalid_type_error: 'Enter the weight' }).min(0.01, 'Weight must be greater than zero'),
  units: z.union([z.literal(''), z.coerce.number().int().min(0)]).optional(),
  declaredValue: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  shipperName: z.string().trim().min(2, 'Shipper name is required').max(160),
  shipperContact: z.string().trim().max(60).optional(),
  consigneeName: z.string().trim().min(2, 'Consignee name is required').max(160),
  consigneeContact: z.string().trim().max(60).optional(),
  origin: z.string().trim().min(2, 'Origin is required').max(160),
  destination: z.string().trim().min(2, 'Destination is required').max(160),
  handlingInstructions: z.string().trim().max(1000).optional(),
});

type CargoValues = z.infer<typeof cargoSchema>;

function CargoFormDialog({
  open,
  onOpenChange,
  cargo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo?: Cargo | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(cargo);

  const form = useForm<CargoValues>({
    resolver: zodResolver(cargoSchema),
    defaultValues: {
      description: '',
      type: 'GENERAL',
      weightTons: 0,
      units: '',
      declaredValue: '',
      shipperName: '',
      shipperContact: '',
      consigneeName: '',
      consigneeContact: '',
      origin: '',
      destination: '',
      handlingInstructions: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof CargoValues>((field, message) =>
    form.setError(field, { message }),
  );

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    form.reset(
      cargo
        ? {
            description: cargo.description,
            type: cargo.type,
            weightTons: cargo.weightTons,
            units: cargo.units ?? '',
            declaredValue: cargo.declaredValue ?? '',
            shipperName: cargo.shipperName,
            shipperContact: cargo.shipperContact ?? '',
            consigneeName: cargo.consigneeName,
            consigneeContact: cargo.consigneeContact ?? '',
            origin: cargo.origin,
            destination: cargo.destination,
            handlingInstructions: cargo.handlingInstructions ?? '',
          }
        : form.formState.defaultValues as CargoValues,
    );
  }, [open, cargo, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: CargoValues) => {
      const payload = {
        ...values,
        units: values.units === '' ? undefined : values.units,
        declaredValue: values.declaredValue === '' ? undefined : values.declaredValue,
      };
      return isEdit
        ? api.patch<{ cargo: Cargo }>(`/cargo/${cargo!.id}`, payload)
        : api.post<{ cargo: Cargo }>('/cargo', payload);
    },
    onSuccess(result) {
      queryClient.invalidateQueries({ queryKey: ['/cargo'] });
      queryClient.invalidateQueries({ queryKey: ['cargo', 'picker'] });
      toast.success(isEdit ? `Cargo ${result.cargo.cargoCode} updated` : `Cargo ${result.cargo.cargoCode} registered`);
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? `Edit ${cargo!.cargoCode}` : 'Register cargo'}
      description={isEdit ? 'Update the consignment details.' : 'Record a consignment so it can be assigned to a trip.'}
      submitLabel={isEdit ? 'Save changes' : 'Register cargo'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      <FormSection title="Consignment">
        <FormField label="Description" htmlFor="description" required error={errors.description?.message}>
          <Input
            id="description"
            placeholder="Palletised FMCG cartons"
            invalid={Boolean(errors.description)}
            {...form.register('description')}
          />
        </FormField>

        <FormGrid>
          <FormField label="Cargo type" error={errors.type?.message}>
            <Select value={form.watch('type')} onValueChange={(value) => form.setValue('type', value as CargoValues['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARGO_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {humanise(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Weight (tons)" htmlFor="weightTons" required error={errors.weightTons?.message}>
            <Input
              id="weightTons"
              type="number"
              step="0.1"
              invalid={Boolean(errors.weightTons)}
              {...form.register('weightTons')}
            />
          </FormField>

          <FormField label="Units / packages" htmlFor="units">
            <Input id="units" type="number" {...form.register('units')} />
          </FormField>

          <FormField label="Declared value (₹)" htmlFor="declaredValue">
            <Input id="declaredValue" type="number" {...form.register('declaredValue')} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Route">
        <FormGrid>
          <FormField label="Origin" htmlFor="origin" required error={errors.origin?.message}>
            <Input id="origin" placeholder="Mumbai, MH" invalid={Boolean(errors.origin)} {...form.register('origin')} />
          </FormField>
          <FormField label="Destination" htmlFor="destination" required error={errors.destination?.message}>
            <Input
              id="destination"
              placeholder="Delhi, DL"
              invalid={Boolean(errors.destination)}
              {...form.register('destination')}
            />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Parties">
        <FormGrid>
          <FormField label="Shipper" htmlFor="shipperName" required error={errors.shipperName?.message}>
            <Input id="shipperName" invalid={Boolean(errors.shipperName)} {...form.register('shipperName')} />
          </FormField>
          <FormField label="Shipper contact" htmlFor="shipperContact">
            <Input id="shipperContact" placeholder="+91XXXXXXXXXX" {...form.register('shipperContact')} />
          </FormField>
          <FormField label="Consignee" htmlFor="consigneeName" required error={errors.consigneeName?.message}>
            <Input id="consigneeName" invalid={Boolean(errors.consigneeName)} {...form.register('consigneeName')} />
          </FormField>
          <FormField label="Consignee contact" htmlFor="consigneeContact">
            <Input id="consigneeContact" placeholder="+91XXXXXXXXXX" {...form.register('consigneeContact')} />
          </FormField>
        </FormGrid>

        <FormField label="Handling instructions" htmlFor="handlingInstructions">
          <Textarea
            id="handlingInstructions"
            rows={2}
            placeholder="Keep upright. Do not stack beyond three tiers."
            {...form.register('handlingInstructions')}
          />
        </FormField>
      </FormSection>
    </ResourceDialog>
  );
}

