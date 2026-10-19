'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeIndianRupee, Check, Clock3, Pencil, Plus, Trash2, X } from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatCurrency, formatDate, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { DriverExpense, Page, Trip, UserRecord } from '@/lib/types';
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
import { Avatar, Tooltip } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';

const EXPENSE_TYPES = ['FOOD', 'LODGING', 'TOLL', 'FUEL', 'REPAIR', 'PARKING', 'LOADING', 'MISC'] as const;
const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'date', filterKeys: ['status', 'type'] });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DriverExpense | null>(null);
  const [rejecting, setRejecting] = React.useState<DriverExpense | null>(null);
  const [deleting, setDeleting] = React.useState<DriverExpense | null>(null);

  const query = useInfiniteList<DriverExpense>({ path: '/expenses', params: list.params });

  const { data: summary } = useQuery({
    queryKey: ['expenses', 'summary'],
    queryFn: () =>
      api.get<Record<'pending' | 'approved' | 'rejected', { count: number; amount: number }>>('/expenses/summary'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expenses', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/approve`),
    onSuccess() {
      invalidate();
      toast.success('Expense approved');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not approve this expense.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess() {
      invalidate();
      toast.success('Expense removed');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove this expense.')),
  });

  const columns: Column<DriverExpense>[] = [
    {
      key: 'expense',
      header: 'Expense',
      width: 'minmax(200px, 1.6fr)',
      render: (expense) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <BadgeIndianRupee className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{humanise(expense.type)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {expense.description ?? 'No description'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(150px, 1fr)',
      hideBelow: 'lg',
      render: (expense) =>
        expense.driver ? (
          <div className="flex items-center gap-2">
            <Avatar name={expense.driver.name} color={expense.driver.avatarColor} size="xs" />
            <span className="truncate">{expense.driver.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'trip',
      header: 'Trip',
      width: 'minmax(100px, 0.6fr)',
      hideBelow: 'xl',
      render: (expense) =>
        expense.trip ? <span className="tabular">{expense.trip.tripCode}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'date',
      header: 'Date',
      width: 'minmax(100px, 0.6fr)',
      sortKey: 'date',
      hideBelow: 'md',
      render: (expense) => <span className="tabular">{formatDate(expense.date, 'd MMM yy')}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(130px, 0.9fr)',
      sortKey: 'status',
      render: (expense) =>
        expense.status === 'REJECTED' && expense.rejectionReason ? (
          <Tooltip label={expense.rejectionReason}>
            <span className="cursor-help">
              <StatusBadge status={expense.status} />
            </span>
          </Tooltip>
        ) : (
          <StatusBadge status={expense.status} />
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'amount',
      align: 'right',
      render: (expense) => <span className="font-semibold tabular">{formatCurrency(expense.amount)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        description={
          isStaff
            ? 'Driver claims waiting on your decision, plus everything already settled.'
            : 'Your expense claims and where each one stands.'
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            {isStaff ? 'Add expense' : 'Submit expense'}
          </Button>
        }
      />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryTile
            label="Pending"
            count={summary.pending.count}
            amount={summary.pending.amount}
            tone="warning"
            onClick={() => list.setFilter('status', 'PENDING')}
          />
          <SummaryTile
            label="Approved"
            count={summary.approved.count}
            amount={summary.approved.amount}
            tone="success"
            onClick={() => list.setFilter('status', 'APPROVED')}
          />
          <SummaryTile
            label="Rejected"
            count={summary.rejected.count}
            amount={summary.rejected.amount}
            tone="danger"
            onClick={() => list.setFilter('status', 'REJECTED')}
          />
        </div>
      ) : null}

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by description…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(EXPENSE_STATUSES, 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'type',
            label: 'Expense type',
            value: list.filters.type ?? 'ALL',
            options: optionsFrom(EXPENSE_TYPES as unknown as string[], 'All types'),
            onChange: (value) => list.setFilter('type', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(expense) => expense.id}
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
        emptyIcon={<BadgeIndianRupee />}
        emptyTitle="No expenses yet"
        emptyDescription={
          isStaff ? 'Driver claims will appear here as soon as they are submitted.' : 'Submit a claim for costs you paid on the road.'
        }
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            {isStaff ? 'Add expense' : 'Submit expense'}
          </Button>
        }
        mobileRow={(expense) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{humanise(expense.type)}</span>
              <span className="font-semibold tabular">{formatCurrency(expense.amount)}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={expense.status} size="sm" />
              <span className="text-xs text-muted-foreground">{formatDate(expense.date)}</span>
            </div>
            {expense.rejectionReason ? (
              <p className="text-xs text-destructive">{expense.rejectionReason}</p>
            ) : null}
          </div>
        )}
        rowActions={(expense) => (
          <RowActions
            actions={[
              {
                label: 'Approve',
                icon: <Check />,
                hidden: !isStaff || expense.status !== 'PENDING',
                onSelect: () => approve.mutate(expense.id),
              },
              {
                label: 'Reject',
                icon: <X />,
                variant: 'destructive',
                hidden: !isStaff || expense.status !== 'PENDING',
                onSelect: () => setRejecting(expense),
              },
              {
                label: 'Edit',
                icon: <Pencil />,
                separatorBefore: isStaff && expense.status === 'PENDING',
                hidden: !isStaff && expense.status !== 'PENDING',
                onSelect: () => {
                  setEditing(expense);
                  setFormOpen(true);
                },
              },
              {
                label: isStaff ? 'Delete' : 'Withdraw claim',
                icon: <Trash2 />,
                variant: 'destructive',
                hidden: !isStaff && expense.status !== 'PENDING',
                onSelect: () => setDeleting(expense),
              },
            ]}
          />
        )}
      />

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />
      <RejectExpenseDialog expense={rejecting} onOpenChange={(open) => !open && setRejecting(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={isStaff ? 'Delete this expense?' : 'Withdraw this claim?'}
        description={`${formatCurrency(deleting?.amount)} · ${humanise(deleting?.type)}. This cannot be undone.`}
        confirmLabel={isStaff ? 'Delete expense' : 'Withdraw claim'}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function SummaryTile({
  label,
  count,
  amount,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  amount: number;
  tone: 'warning' | 'success' | 'danger';
  onClick: () => void;
}) {
  const tones = {
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    danger: 'bg-destructive-soft text-destructive',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card flex items-center gap-3 p-4 text-left transition-shadow hover:shadow-md focus-ring"
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Clock3 className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-[15px] font-semibold tabular">{formatCurrency(amount)}</p>
        <p className="text-2xs text-muted-foreground">
          {count} claim{count === 1 ? '' : 's'}
        </p>
      </div>
    </button>
  );
}

const expenseSchema = z.object({
  driver: z.string().optional(),
  trip: z.string().optional(),
  type: z.enum(EXPENSE_TYPES),
  amount: z.coerce.number({ invalid_type_error: 'Enter the amount' }).min(1, 'Amount must be greater than zero'),
  date: z.string().min(1, 'Choose the date'),
  description: z.string().trim().max(1000).optional(),
});

type ExpenseValues = z.infer<typeof expenseSchema>;

function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: DriverExpense | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isEdit = Boolean(expense);

  const form = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      driver: '',
      trip: 'NONE',
      type: 'FOOD',
      amount: 0,
      date: toDateInput(new Date()),
      description: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof ExpenseValues>((field, message) =>
    form.setError(field, { message }),
  );

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'picker'],
    queryFn: () => api.get<Page<UserRecord>>('/drivers', { limit: 100, status: 'ACTIVE' }),
    enabled: open && isStaff,
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
    if (expense) {
      form.reset({
        driver: expense.driver?.id ?? '',
        trip: expense.trip?.id ?? 'NONE',
        type: expense.type,
        amount: expense.amount,
        date: toDateInput(expense.date),
        description: expense.description ?? '',
      });
    } else {
      form.reset({
        driver: '',
        trip: 'NONE',
        type: 'FOOD',
        amount: 0,
        date: toDateInput(new Date()),
        description: '',
      });
    }
  }, [open, expense, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: ExpenseValues) => {
      const payload = {
        type: values.type,
        amount: values.amount,
        date: new Date(values.date).toISOString(),
        description: values.description || undefined,
        trip: values.trip === 'NONE' ? null : values.trip,
        // A driver's own claims never carry a driver id — the API uses the session.
        ...(isStaff && !isEdit ? { driver: values.driver } : {}),
      };
      return isEdit ? api.patch(`/expenses/${expense!.id}`, payload) : api.post('/expenses', payload);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Expense updated' : 'Expense submitted for review');
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit expense' : isStaff ? 'Add an expense' : 'Submit an expense'}
      description={
        isStaff
          ? 'Record a cost on behalf of a driver. It still goes through review.'
          : 'Claims are reviewed by a manager before they are settled.'
      }
      submitLabel={isEdit ? 'Save changes' : 'Submit'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      {isStaff && !isEdit ? (
        <FormField label="Driver" required error={errors.driver?.message}>
          <Select value={form.watch('driver')} onValueChange={(value) => form.setValue('driver', value)}>
            <SelectTrigger invalid={Boolean(errors.driver)}>
              <SelectValue placeholder="Choose the driver" />
            </SelectTrigger>
            <SelectContent>
              {drivers?.items.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : null}

      <FormGrid>
        <FormField label="Expense type" required>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as ExpenseValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanise(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Amount (₹)" htmlFor="amount" required error={errors.amount?.message}>
          <Input id="amount" type="number" invalid={Boolean(errors.amount)} {...form.register('amount')} />
        </FormField>

        <FormField label="Date" htmlFor="expense-date" required error={errors.date?.message}>
          <Input id="expense-date" type="date" invalid={Boolean(errors.date)} {...form.register('date')} />
        </FormField>

        <FormField label="Trip" hint="Optional — links the claim to a trip.">
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
      </FormGrid>

      <FormField label="Description" htmlFor="expense-description" error={errors.description?.message}>
        <Textarea
          id="expense-description"
          rows={3}
          placeholder="What was this for? Include the receipt number if you have one."
          {...form.register('description')}
        />
      </FormField>
    </ResourceDialog>
  );
}

function RejectExpenseDialog({
  expense,
  onOpenChange,
}: {
  expense: DriverExpense | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (expense) {
      setReason('');
      setError(null);
    }
  }, [expense]);

  const reject = useMutation({
    mutationFn: () => api.post(`/expenses/${expense!.id}/reject`, { reason }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Expense rejected', { description: 'The driver has been notified with your reason.' });
      onOpenChange(false);
    },
    onError: (mutationError) => setError(errorMessage(mutationError, 'Could not reject this expense.')),
  });

  return (
    <ResourceDialog
      open={Boolean(expense)}
      onOpenChange={onOpenChange}
      title="Reject this expense"
      description={
        expense
          ? `${formatCurrency(expense.amount)} · ${humanise(expense.type)} · ${expense.driver?.name ?? ''}`
          : undefined
      }
      submitLabel="Reject expense"
      submitVariant="destructive"
      cancelLabel="Keep pending"
      loading={reject.isPending}
      error={error}
      submitDisabled={reason.trim().length < 3}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        reject.mutate();
      }}
    >
      <FormField
        label="Reason for rejection"
        htmlFor="reject-reason"
        required
        hint="The driver sees this, so be specific about what needs to change."
      >
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Receipt was not legible — please resubmit with a clear photo."
          autoFocus
        />
      </FormField>
    </ResourceDialog>
  );
}
