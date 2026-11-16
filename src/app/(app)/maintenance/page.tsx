'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, Pencil, Plus, Trash2, Wrench } from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { MaintenanceRecord, Page, Truck } from '@/lib/types';
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
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';

const MAINTENANCE_TYPES = [
  'ROUTINE_SERVICE',
  'ENGINE',
  'TYRE',
  'BRAKES',
  'ELECTRICAL',
  'BODYWORK',
  'AC_COOLING',
  'INSPECTION',
  'ACCIDENT_REPAIR',
  'OTHER',
] as const;
const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'date', filterKeys: ['status', 'type'] });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MaintenanceRecord | null>(null);
  const [deleting, setDeleting] = React.useState<MaintenanceRecord | null>(null);

  const query = useInfiniteList<MaintenanceRecord>({ path: '/maintenance', params: list.params });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/${id}`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Maintenance record deleted');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this record.')),
  });

  const columns: Column<MaintenanceRecord>[] = [
    {
      key: 'job',
      header: 'Job',
      width: 'minmax(240px, 2fr)',
      render: (record) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Wrench className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{humanise(record.type)}</p>
            <p className="truncate text-xs text-muted-foreground">{record.description}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'truck',
      header: 'Truck',
      width: 'minmax(120px, 0.8fr)',
      render: (record) => <span className="tabular">{record.truck?.truckNumber ?? '—'}</span>,
    },
    {
      key: 'provider',
      header: 'Service provider',
      width: 'minmax(150px, 1fr)',
      hideBelow: 'xl',
      render: (record) => (
        <span className="truncate text-muted-foreground">{record.serviceProvider ?? '—'}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'date',
      hideBelow: 'md',
      render: (record) => (
        <div className="text-xs">
          <p className="tabular">{formatDate(record.date, 'd MMM yy')}</p>
          {record.nextServiceDate ? (
            <p className="flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="size-3" />
              {formatDate(record.nextServiceDate, 'd MMM')}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'status',
      render: (record) => <StatusBadge status={record.status} />,
    },
    {
      key: 'cost',
      header: 'Estimated / actual',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'cost',
      align: 'right',
      render: (record) => record.status === 'COMPLETED' ? (
        <div className="text-right">
          <p className="font-semibold tabular">Actual {formatCurrency(record.cost)}</p>
          <p className="text-[11px] text-muted-foreground tabular">Estimate {formatCurrency(record.estimatedCost ?? 0)} · variance {formatCurrency(record.cost - (record.estimatedCost ?? 0))}</p>
        </div>
      ) : <span className="font-semibold tabular">Estimate {formatCurrency(record.estimatedCost ?? 0)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Maintenance"
        description={isStaff ? 'Service history and scheduled work across the fleet.' : 'Service history for your truck.'}
        actions={
          isStaff ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Log maintenance
            </Button>
          ) : null
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by description or provider…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(MAINTENANCE_STATUSES as unknown as string[], 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'type',
            label: 'Type',
            value: list.filters.type ?? 'ALL',
            options: optionsFrom(MAINTENANCE_TYPES as unknown as string[], 'All types'),
            onChange: (value) => list.setFilter('type', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(record) => record.id}
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
        emptyIcon={<Wrench />}
        emptyTitle="No maintenance recorded"
        emptyDescription="Log a service or repair to build the vehicle history."
        mobileRow={(record) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{humanise(record.type)}</span>
              <span className="text-right font-semibold tabular">{record.status === 'COMPLETED' ? `Actual ${formatCurrency(record.cost)} · Est. ${formatCurrency(record.estimatedCost ?? 0)}` : `Est. ${formatCurrency(record.estimatedCost ?? 0)}`}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{record.description}</p>
            <p className="text-xs text-muted-foreground">
              {record.truck?.truckNumber} · {formatDate(record.date)}
            </p>
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

      {isStaff ? (
        <>
          <MaintenanceFormDialog open={formOpen} onOpenChange={setFormOpen} record={editing} />
          <ConfirmDialog
            open={Boolean(deleting)}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Delete this maintenance record?"
            description="The vehicle history and cost totals will be updated."
            confirmLabel="Delete record"
            loading={remove.isPending}
            onConfirm={() => deleting && remove.mutate(deleting.id)}
          />
        </>
      ) : null}
    </div>
  );
}

const maintenanceSchema = z.object({
  truck: z.string().min(1, 'Choose the truck'),
  type: z.enum(MAINTENANCE_TYPES),
  description: z.string().trim().min(3, 'Describe the work carried out').max(2000),
  cost: z.coerce.number({ invalid_type_error: 'Enter the cost' }).min(0, 'Cost cannot be negative'),
  estimatedPartsCost: z.coerce.number().min(0).default(0),
  estimatedLabourCost: z.coerce.number().min(0).default(0),
  estimatedOtherCost: z.coerce.number().min(0).default(0),
  estimatedTax: z.coerce.number().min(0).default(0),
  actualPartsCost: z.coerce.number().min(0).default(0),
  actualLabourCost: z.coerce.number().min(0).default(0),
  actualOtherCost: z.coerce.number().min(0).default(0),
  actualTax: z.coerce.number().min(0).default(0),
  date: z.string().min(1, 'Choose the service date'),
  serviceProvider: z.string().trim().max(160).optional(),
  nextServiceDate: z.string().optional(),
  odometerKm: z.union([z.literal(''), z.coerce.number().min(0).multipleOf(0.1)]).optional(),
  status: z.enum(MAINTENANCE_STATUSES),
});

type MaintenanceValues = z.infer<typeof maintenanceSchema>;

function MaintenanceFormDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: MaintenanceRecord | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(record);

  const form = useForm<MaintenanceValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      truck: '',
      type: 'ROUTINE_SERVICE',
      description: '',
      cost: 0,
      estimatedPartsCost: 0,
      estimatedLabourCost: 0,
      estimatedOtherCost: 0,
      estimatedTax: 0,
      actualPartsCost: 0,
      actualLabourCost: 0,
      actualOtherCost: 0,
      actualTax: 0,
      date: toDateInput(new Date()),
      serviceProvider: '',
      nextServiceDate: '',
      odometerKm: '',
      status: 'COMPLETED',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof MaintenanceValues>(
    (field, message) => form.setError(field, { message }),
  );

  const { data: trucks } = useQuery({
    queryKey: ['trucks', 'picker'],
    queryFn: () => api.get<Page<Truck>>('/trucks', { limit: 100 }),
    enabled: open,
    staleTime: 30_000,
  });

  const selectedTruck = form.watch('truck');
  const selectedType = form.watch('type');
  const { data: estimateHistory } = useQuery({
    queryKey: ['maintenance', 'estimate-history', selectedTruck, selectedType],
    queryFn: () => api.get<Page<MaintenanceRecord>>('/maintenance', {
      truck: selectedTruck,
      type: selectedType,
      status: 'COMPLETED',
      sortBy: 'date',
      sortDir: 'desc',
      limit: 10,
    }),
    enabled: open && !isEdit && Boolean(selectedTruck && selectedType),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const previous = estimateHistory?.items[0];
    if (!open || isEdit || !previous) return;
    const suggestedTotal = previous.estimatedCost || previous.cost || 0;
    const hasBreakdown = (previous.estimatedPartsCost ?? 0) + (previous.estimatedLabourCost ?? 0) +
      (previous.estimatedOtherCost ?? 0) + (previous.estimatedTax ?? 0) > 0;
    const fields: [keyof MaintenanceValues, number][] = [
      ['estimatedPartsCost', hasBreakdown ? previous.estimatedPartsCost ?? 0 : suggestedTotal],
      ['estimatedLabourCost', hasBreakdown ? previous.estimatedLabourCost ?? 0 : 0],
      ['estimatedOtherCost', hasBreakdown ? previous.estimatedOtherCost ?? 0 : 0],
      ['estimatedTax', hasBreakdown ? previous.estimatedTax ?? 0 : 0],
    ];
    for (const [field, value] of fields) {
      if (!form.getFieldState(field).isDirty) form.setValue(field, value);
    }
  }, [estimateHistory, form, isEdit, open]);

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    if (record) {
      form.reset({
        truck: record.truck?.id ?? '',
        type: record.type,
        description: record.description,
        cost: record.cost,
        estimatedPartsCost: record.estimatedPartsCost ?? 0,
        estimatedLabourCost: record.estimatedLabourCost ?? 0,
        estimatedOtherCost: record.estimatedOtherCost ?? 0,
        estimatedTax: record.estimatedTax ?? 0,
        actualPartsCost: record.actualPartsCost ?? 0,
        actualLabourCost: record.actualLabourCost ?? 0,
        actualOtherCost: record.actualOtherCost ?? 0,
        actualTax: record.actualTax ?? 0,
        date: toDateInput(record.date),
        serviceProvider: record.serviceProvider ?? '',
        nextServiceDate: toDateInput(record.nextServiceDate),
        odometerKm: record.odometerKm ?? '',
        status: record.status,
      });
    }
  }, [open, record, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: MaintenanceValues) => {
      const payload = {
        ...values,
        odometerKm: values.odometerKm === '' ? undefined : values.odometerKm,
        date: new Date(values.date).toISOString(),
        nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
      };
      return isEdit
        ? api.patch(`/maintenance/${record!.id}`, payload)
        : api.post('/maintenance', payload);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['/trucks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Maintenance record updated' : 'Maintenance logged');
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;
  const estimateTotal = [
    form.watch('estimatedPartsCost'), form.watch('estimatedLabourCost'),
    form.watch('estimatedOtherCost'), form.watch('estimatedTax'),
  ].reduce((total, value) => total + Number(value || 0), 0);
  const actualTotal = [
    form.watch('actualPartsCost'), form.watch('actualLabourCost'),
    form.watch('actualOtherCost'), form.watch('actualTax'),
  ].reduce((total, value) => total + Number(value || 0), 0);

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit maintenance record' : 'Log maintenance'}
      description="Future maintenance reserves only its service date. Work in progress takes the truck off the road."
      submitLabel={isEdit ? 'Save changes' : 'Log maintenance'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      <FormGrid>
        <FormField label="Truck" required error={errors.truck?.message}>
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
        </FormField>

        <FormField label="Type" required>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as MaintenanceValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanise(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      <FormField label="Description" htmlFor="description" required error={errors.description?.message}>
        <Textarea
          id="description"
          rows={3}
          placeholder="Scheduled 20,000 km service — engine oil, filters and general inspection"
          invalid={Boolean(errors.description)}
          {...form.register('description')}
        />
      </FormField>

      <FormGrid>
        <FormField label="Parts estimate (₹)" htmlFor="estimatedPartsCost" hint={!isEdit && estimateHistory?.items[0] ? 'Suggested from this truck’s latest completed service of this type.' : undefined}>
          <Input id="estimatedPartsCost" type="number" min="0" step="0.01" {...form.register('estimatedPartsCost')} />
        </FormField>
        <FormField label="Labour estimate (₹)" htmlFor="estimatedLabourCost">
          <Input id="estimatedLabourCost" type="number" min="0" step="0.01" {...form.register('estimatedLabourCost')} />
        </FormField>
        <FormField label="Other estimate (₹)" htmlFor="estimatedOtherCost">
          <Input id="estimatedOtherCost" type="number" min="0" step="0.01" {...form.register('estimatedOtherCost')} />
        </FormField>
        <FormField label="Estimate tax (₹)" htmlFor="estimatedTax">
          <Input id="estimatedTax" type="number" min="0" step="0.01" {...form.register('estimatedTax')} />
        </FormField>

        <FormField label="Actual parts (₹)" htmlFor="actualPartsCost">
          <Input id="actualPartsCost" type="number" min="0" step="0.01" {...form.register('actualPartsCost')} />
        </FormField>
        <FormField label="Actual labour (₹)" htmlFor="actualLabourCost">
          <Input id="actualLabourCost" type="number" min="0" step="0.01" {...form.register('actualLabourCost')} />
        </FormField>
        <FormField label="Actual other (₹)" htmlFor="actualOtherCost">
          <Input id="actualOtherCost" type="number" min="0" step="0.01" {...form.register('actualOtherCost')} />
        </FormField>
        <FormField label="Actual tax (₹)" htmlFor="actualTax">
          <Input id="actualTax" type="number" min="0" step="0.01" {...form.register('actualTax')} />
        </FormField>

        <FormField label="Legacy / total actual cost (₹)" htmlFor="cost" error={errors.cost?.message}>
          <Input id="cost" type="number" min="0" step="0.01" invalid={Boolean(errors.cost)} {...form.register('cost')} />
        </FormField>

        <FormField label="Service date" htmlFor="maintenance-date" required error={errors.date?.message}>
          <Input id="maintenance-date" type="date" invalid={Boolean(errors.date)} {...form.register('date')} />
        </FormField>

        <FormField label="Service provider" htmlFor="serviceProvider">
          <Input id="serviceProvider" placeholder="Tata Motors Authorised Service" {...form.register('serviceProvider')} />
        </FormField>

        <FormField label="Next service due" htmlFor="nextServiceDate">
          <Input id="nextServiceDate" type="date" {...form.register('nextServiceDate')} />
        </FormField>

        <FormField label="Odometer (km)" htmlFor="maintenance-odometer" hint={record?.odometerKm != null ? 'Submitted readings are immutable; corrections are audited.' : 'Must be at least the truck’s latest verified reading.'}>
          <Input id="maintenance-odometer" type="number" min={trucks?.items.find((truck) => truck.id === form.watch('truck'))?.odometerKm ?? 0} step="0.1" disabled={record?.odometerKm != null} {...form.register('odometerKm')} />
        </FormField>

        <FormField label="Status">
          <Select
            value={form.watch('status')}
            onValueChange={(value) => form.setValue('status', value as MaintenanceValues['status'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {humanise(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm sm:col-span-2">
          <span>Estimated total: <strong className="tabular">{formatCurrency(estimateTotal)}</strong></span>
          <span>Actual total: <strong className="tabular">{formatCurrency(actualTotal || Number(form.watch('cost') || 0))}</strong></span>
        </div>
      </FormGrid>
    </ResourceDialog>
  );
}
