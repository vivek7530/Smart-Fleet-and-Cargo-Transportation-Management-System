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
      header: 'Cost',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'cost',
      align: 'right',
      render: (record) => <span className="font-semibold tabular">{formatCurrency(record.cost)}</span>,
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
              <span className="font-semibold tabular">{formatCurrency(record.cost)}</span>
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
  date: z.string().min(1, 'Choose the service date'),
  serviceProvider: z.string().trim().max(160).optional(),
  nextServiceDate: z.string().optional(),
  odometerKm: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
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

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    if (record) {
      form.reset({
        truck: record.truck?.id ?? '',
        type: record.type,
        description: record.description,
        cost: record.cost,
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

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit maintenance record' : 'Log maintenance'}
      description="Scheduled or in-progress work takes the truck off the road until it is completed."
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
        <FormField label="Cost (₹)" htmlFor="cost" required error={errors.cost?.message}>
          <Input id="cost" type="number" invalid={Boolean(errors.cost)} {...form.register('cost')} />
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

        <FormField label="Odometer (km)" htmlFor="maintenance-odometer">
          <Input id="maintenance-odometer" type="number" {...form.register('odometerKm')} />
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
      </FormGrid>
    </ResourceDialog>
  );
}
