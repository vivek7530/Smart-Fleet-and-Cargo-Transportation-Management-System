'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, LifeBuoy, MapPin, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { BreakdownReport, Page, Truck } from '@/lib/types';
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
import { StatusBadge } from '@/components/ui/status-badge';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES = ['REPORTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as const;

export default function BreakdownsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'reportedAt', filterKeys: ['status', 'severity'] });
  const [reportOpen, setReportOpen] = React.useState(false);
  const [updating, setUpdating] = React.useState<BreakdownReport | null>(null);

  const query = useInfiniteList<BreakdownReport>({ path: '/breakdowns', params: list.params });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: string; resolutionNotes?: string }) =>
      api.post(`/breakdowns/${input.id}/status`, { status: input.status, resolutionNotes: input.resolutionNotes }),
    onSuccess(_data, variables) {
      queryClient.invalidateQueries({ queryKey: ['/breakdowns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
      toast.success(`Marked as ${humanise(variables.status).toLowerCase()}`);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update this report.')),
  });

  const columns: Column<BreakdownReport>[] = [
    {
      key: 'report',
      header: 'Report',
      width: 'minmax(250px, 2fr)',
      render: (report) => (
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
              report.severity === 'CRITICAL' || report.severity === 'HIGH'
                ? 'bg-destructive-soft text-destructive'
                : 'bg-warning-soft text-warning'
            }`}
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="tabular">{report.reportCode}</span>
              <StatusBadge status={report.severity} size="sm" />
            </p>
            <p className="line-clamp-1 text-xs text-muted-foreground">{report.description}</p>
            <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
              <MapPin className="size-3" />
              {report.location}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'truck',
      header: 'Truck',
      width: 'minmax(110px, 0.7fr)',
      hideBelow: 'md',
      render: (report) => <span className="tabular">{report.truck?.truckNumber ?? '—'}</span>,
    },
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(150px, 1fr)',
      hideBelow: 'lg',
      render: (report) =>
        report.driver ? (
          <div className="flex items-center gap-2">
            <Avatar name={report.driver.name} color={report.driver.avatarColor} size="xs" />
            <span className="truncate">{report.driver.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'reported',
      header: 'Reported',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'reportedAt',
      hideBelow: 'xl',
      render: (report) => (
        <span className="text-xs text-muted-foreground">{formatRelative(report.reportedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(130px, 0.9fr)',
      sortKey: 'status',
      render: (report) => <StatusBadge status={report.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Breakdowns"
        description={
          isStaff
            ? 'Roadside incidents reported from the field, and where each one stands.'
            : 'Problems you have reported and how they are being handled.'
        }
        actions={
          <Button variant={isStaff ? 'outline' : 'default'} onClick={() => setReportOpen(true)}>
            <Plus />
            Report a breakdown
          </Button>
        }
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by code, location or description…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(STATUSES as unknown as string[], 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'severity',
            label: 'Severity',
            value: list.filters.severity ?? 'ALL',
            options: optionsFrom(SEVERITIES as unknown as string[], 'All severities'),
            onChange: (value) => list.setFilter('severity', value),
            primary: true,
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(report) => report.id}
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
        emptyIcon={<LifeBuoy />}
        emptyTitle="No breakdowns reported"
        emptyDescription="Good news — nothing has gone wrong on the road."
        mobileRow={(report) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-medium tabular">{report.reportCode}</span>
              <StatusBadge status={report.severity} size="sm" />
              <StatusBadge status={report.status} size="sm" />
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{report.description}</p>
            <p className="text-xs text-muted-foreground">
              {report.truck?.truckNumber} · {formatRelative(report.reportedAt)}
            </p>
          </div>
        )}
        rowActions={(report) => (
          <RowActions
            actions={[
              {
                label: 'Acknowledge',
                icon: <CheckCircle2 />,
                hidden: !isStaff || report.status !== 'REPORTED',
                onSelect: () => setStatus.mutate({ id: report.id, status: 'ACKNOWLEDGED' }),
              },
              {
                label: 'Mark in progress',
                icon: <Wrench />,
                hidden: !isStaff || ['RESOLVED', 'IN_PROGRESS', 'CANCELLED'].includes(report.status),
                onSelect: () => setStatus.mutate({ id: report.id, status: 'IN_PROGRESS' }),
              },
              {
                label: 'Resolve',
                icon: <CheckCircle2 />,
                separatorBefore: true,
                hidden: !isStaff || ['RESOLVED', 'CANCELLED'].includes(report.status),
                onSelect: () => setUpdating(report),
              },
            ]}
          />
        )}
      />

      <ReportBreakdownDialog open={reportOpen} onOpenChange={setReportOpen} />
      <ResolveDialog
        report={updating}
        onOpenChange={(open) => !open && setUpdating(null)}
        onResolve={(notes) =>
          updating && setStatus.mutate({ id: updating.id, status: 'RESOLVED', resolutionNotes: notes })
        }
        loading={setStatus.isPending}
      />
    </div>
  );
}

const breakdownSchema = z.object({
  truck: z.string().min(1, 'Choose the truck'),
  location: z.string().trim().min(2, 'Where did it happen?').max(200),
  description: z.string().trim().min(5, 'Describe the problem').max(2000),
  severity: z.enum(SEVERITIES),
});

type BreakdownValues = z.infer<typeof breakdownSchema>;

function ReportBreakdownDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isDriver = user?.role === 'DRIVER';

  const form = useForm<BreakdownValues>({
    resolver: zodResolver(breakdownSchema),
    defaultValues: { truck: '', location: '', description: '', severity: 'MEDIUM' },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof BreakdownValues>(
    (field, message) => form.setError(field, { message }),
  );

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

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    form.reset({
      truck: isDriver ? (assignedTruck?.truck?.id ?? '') : '',
      location: '',
      description: '',
      severity: 'MEDIUM',
    });
  }, [open, isDriver, assignedTruck, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: BreakdownValues) => api.post('/breakdowns', values),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/breakdowns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/trucks'] });
      toast.success('Breakdown reported', { description: 'Your managers have been notified.' });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Report a breakdown"
      description="Managers are alerted immediately. A high or critical report also takes the truck off the road."
      submitLabel="Report breakdown"
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
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

        <FormField label="Severity" required>
          <Select
            value={form.watch('severity')}
            onValueChange={(value) => form.setValue('severity', value as BreakdownValues['severity'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {humanise(severity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      <FormField label="Location" htmlFor="bd-location" required error={errors.location?.message}>
        <Input
          id="bd-location"
          placeholder="NH48, km 214 marker, near Vapi"
          invalid={Boolean(errors.location)}
          {...form.register('location')}
        />
      </FormField>

      <FormField
        label="What happened?"
        htmlFor="bd-description"
        required
        error={errors.description?.message}
        hint="Describe the fault and whether the vehicle is drivable."
      >
        <Textarea
          id="bd-description"
          rows={4}
          placeholder="Rear left tyre burst on the expressway, vehicle pulled over on the shoulder."
          invalid={Boolean(errors.description)}
          {...form.register('description')}
        />
      </FormField>
    </ResourceDialog>
  );
}

function ResolveDialog({
  report,
  onOpenChange,
  onResolve,
  loading,
}: {
  report: BreakdownReport | null;
  onOpenChange: (open: boolean) => void;
  onResolve: (notes: string) => void;
  loading: boolean;
}) {
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    if (report) setNotes('');
  }, [report]);

  return (
    <ResourceDialog
      open={Boolean(report)}
      onOpenChange={onOpenChange}
      title={`Resolve ${report?.reportCode ?? ''}`}
      description={
        report ? `Reported ${formatDateTime(report.reportedAt)} at ${report.location}` : undefined
      }
      submitLabel="Mark resolved"
      submitVariant="default"
      loading={loading}
      onSubmit={(event) => {
        event.preventDefault();
        onResolve(notes);
        onOpenChange(false);
      }}
    >
      <div className="rounded-lg border bg-muted/40 px-3.5 py-3 text-[13px] text-muted-foreground">
        Resolving the last open report for this truck returns it to service automatically.
      </div>

      <FormField label="Resolution notes" htmlFor="resolve-notes" hint="Shared with the driver who reported it.">
        <Textarea
          id="resolve-notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Roadside assistance dispatched, tyre replaced and vehicle released the same day."
        />
      </FormField>
    </ResourceDialog>
  );
}
