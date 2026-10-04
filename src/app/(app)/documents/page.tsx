'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, FileText, FileWarning, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { DocumentRecord, Page, Trip, Truck, UserRecord } from '@/lib/types';
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
import { ExpiryCell } from '@/components/data/expiry-cell';

const DOCUMENT_TYPES = [
  'INSURANCE',
  'REGISTRATION',
  'PERMIT',
  'FITNESS',
  'POLLUTION',
  'LICENSE',
  'RECEIPT',
  'PROOF_OF_DELIVERY',
  'INVOICE',
  'CONTRACT',
  'OTHER',
] as const;
const OWNER_TYPES = ['TRUCK', 'DRIVER', 'TRIP'] as const;
const DOCUMENT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'];

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const list = useListState({
    defaultSort: 'expiryDate',
    defaultSortDir: 'asc',
    filterKeys: ['status', 'type', 'ownerType', 'expiring'],
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentRecord | null>(null);
  const [rejecting, setRejecting] = React.useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = React.useState<DocumentRecord | null>(null);

  const query = useInfiniteList<DocumentRecord>({ path: '/documents', params: list.params });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/documents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
  };

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/documents/${id}/verify`),
    onSuccess() {
      invalidate();
      toast.success('Document verified');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not verify this document.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess() {
      invalidate();
      toast.success('Document removed');
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove this document.')),
  });

  const columns: Column<DocumentRecord>[] = [
    {
      key: 'document',
      header: 'Document',
      width: 'minmax(230px, 1.8fr)',
      sortKey: 'name',
      render: (doc) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{doc.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {humanise(doc.type)}
              {doc.referenceNumber ? ` · ${doc.referenceNumber}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'belongsTo',
      header: 'Belongs to',
      width: 'minmax(150px, 1fr)',
      hideBelow: 'lg',
      render: (doc) => (
        <span className="truncate text-muted-foreground">
          {doc.truck?.truckNumber ?? doc.driver?.name ?? doc.trip?.tripCode ?? humanise(doc.ownerType)}
        </span>
      ),
    },
    {
      key: 'issuedBy',
      header: 'Issued by',
      width: 'minmax(150px, 1fr)',
      hideBelow: 'xl',
      render: (doc) => <span className="truncate text-muted-foreground">{doc.issuedBy ?? '—'}</span>,
    },
    {
      key: 'expiry',
      header: 'Expiry',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'expiryDate',
      render: (doc) => <ExpiryCell date={doc.expiryDate} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'status',
      render: (doc) => <StatusBadge status={doc.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Insurance, permits, licences and proofs of delivery — tracked by reference number and validity."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add document
          </Button>
        }
      />

      <div className="surface-card flex items-start gap-3 border-info/20 bg-info-soft/40 p-4">
        <FileWarning className="mt-0.5 size-4 shrink-0 text-info" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          CargoEntry stores no files. Each document is a record — its reference number, issuer and validity
          window — so expiry warnings work without holding a copy of the paperwork.
        </p>
      </div>

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by name, reference or issuer…"
        total={query.total}
        loadedCount={query.items.length}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(DOCUMENT_STATUSES, 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'expiring',
            label: 'Expiry',
            value: list.filters.expiring ?? 'ALL',
            options: [
              { label: 'Any expiry', value: 'ALL' },
              { label: 'Expiring in 30 days', value: '30' },
              { label: 'Expiring in 90 days', value: '90' },
            ],
            onChange: (value) => list.setFilter('expiring', value),
            primary: true,
          },
          {
            key: 'type',
            label: 'Type',
            value: list.filters.type ?? 'ALL',
            options: optionsFrom(DOCUMENT_TYPES as unknown as string[], 'All types'),
            onChange: (value) => list.setFilter('type', value),
          },
          {
            key: 'ownerType',
            label: 'Belongs to',
            value: list.filters.ownerType ?? 'ALL',
            options: optionsFrom(OWNER_TYPES as unknown as string[], 'Anything'),
            onChange: (value) => list.setFilter('ownerType', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(doc) => doc.id}
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
        emptyIcon={<FileText />}
        emptyTitle="No documents tracked"
        emptyDescription="Add a document so its expiry appears in the compliance warnings."
        emptyAction={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add document
          </Button>
        }
        mobileRow={(doc) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{doc.name}</span>
              <StatusBadge status={doc.status} size="sm" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {humanise(doc.type)} · {doc.truck?.truckNumber ?? doc.driver?.name ?? doc.trip?.tripCode ?? '—'}
            </p>
            <div className="text-xs">
              <ExpiryCell date={doc.expiryDate} />
            </div>
          </div>
        )}
        rowActions={(doc) => (
          <RowActions
            actions={[
              {
                label: 'Verify',
                icon: <Check />,
                hidden: !isStaff || doc.status === 'VERIFIED',
                onSelect: () => verify.mutate(doc.id),
              },
              {
                label: 'Reject',
                icon: <X />,
                variant: 'destructive',
                hidden: !isStaff || doc.status === 'REJECTED',
                onSelect: () => setRejecting(doc),
              },
              {
                label: 'Edit',
                icon: <Pencil />,
                separatorBefore: isStaff,
                onSelect: () => {
                  setEditing(doc);
                  setFormOpen(true);
                },
              },
              {
                label: 'Delete',
                icon: <Trash2 />,
                variant: 'destructive',
                onSelect: () => setDeleting(doc),
              },
            ]}
          />
        )}
      />

      <DocumentFormDialog open={formOpen} onOpenChange={setFormOpen} document={editing} />
      <RejectDocumentDialog document={rejecting} onOpenChange={(open) => !open && setRejecting(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="The record and its expiry warning are removed."
        confirmLabel="Delete document"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

const documentSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the document a name').max(200),
    type: z.enum(DOCUMENT_TYPES),
    ownerType: z.enum(OWNER_TYPES),
    truck: z.string().optional(),
    driver: z.string().optional(),
    trip: z.string().optional(),
    referenceNumber: z.string().trim().max(120).optional(),
    issuedBy: z.string().trim().max(160).optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.ownerType !== 'TRUCK' || Boolean(data.truck), {
    message: 'Choose the truck this document belongs to',
    path: ['truck'],
  })
  .refine((data) => data.ownerType !== 'DRIVER' || Boolean(data.driver), {
    message: 'Choose the driver this document belongs to',
    path: ['driver'],
  })
  .refine((data) => data.ownerType !== 'TRIP' || Boolean(data.trip), {
    message: 'Choose the trip this document belongs to',
    path: ['trip'],
  });

type DocumentValues = z.infer<typeof documentSchema>;

function DocumentFormDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: DocumentRecord | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isEdit = Boolean(document);

  const form = useForm<DocumentValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      name: '',
      type: 'INSURANCE',
      ownerType: 'TRUCK',
      truck: '',
      driver: '',
      trip: '',
      referenceNumber: '',
      issuedBy: '',
      issueDate: '',
      expiryDate: '',
      notes: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof DocumentValues>((field, message) =>
    form.setError(field, { message }),
  );

  const ownerType = form.watch('ownerType');

  const { data: trucks } = useQuery({
    queryKey: ['trucks', 'picker'],
    queryFn: () => api.get<Page<Truck>>('/trucks', { limit: 100 }),
    enabled: open && isStaff && ownerType === 'TRUCK',
    staleTime: 30_000,
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'picker'],
    queryFn: () => api.get<Page<UserRecord>>('/drivers', { limit: 100 }),
    enabled: open && isStaff && ownerType === 'DRIVER',
    staleTime: 30_000,
  });

  const { data: trips } = useQuery({
    queryKey: ['trips', 'picker-active'],
    queryFn: () => api.get<Page<Trip>>('/trips', { limit: 50 }),
    enabled: open && ownerType === 'TRIP',
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    if (document) {
      form.reset({
        name: document.name,
        type: document.type,
        ownerType: (document.ownerType === 'EXPENSE' || document.ownerType === 'BREAKDOWN'
          ? 'TRIP'
          : document.ownerType) as DocumentValues['ownerType'],
        truck: document.truck?.id ?? '',
        driver: document.driver?.id ?? '',
        trip: document.trip?.id ?? '',
        referenceNumber: document.referenceNumber ?? '',
        issuedBy: document.issuedBy ?? '',
        issueDate: toDateInput(document.issueDate),
        expiryDate: toDateInput(document.expiryDate),
        notes: document.notes ?? '',
      });
    } else {
      // A driver can only file documents against themselves.
      form.reset({
        name: '',
        type: isStaff ? 'INSURANCE' : 'LICENSE',
        ownerType: isStaff ? 'TRUCK' : 'DRIVER',
        truck: '',
        driver: '',
        trip: '',
        referenceNumber: '',
        issuedBy: '',
        issueDate: '',
        expiryDate: '',
        notes: '',
      });
    }
  }, [open, document, isStaff, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: DocumentValues) => {
      const payload = {
        ...values,
        truck: values.ownerType === 'TRUCK' ? values.truck : undefined,
        driver: values.ownerType === 'DRIVER' ? values.driver || undefined : undefined,
        trip: values.ownerType === 'TRIP' ? values.trip : undefined,
        issueDate: values.issueDate || null,
        expiryDate: values.expiryDate || null,
      };
      return isEdit
        ? api.patch(`/documents/${document!.id}`, {
            name: payload.name,
            type: payload.type,
            referenceNumber: payload.referenceNumber,
            issuedBy: payload.issuedBy,
            issueDate: payload.issueDate,
            expiryDate: payload.expiryDate,
            notes: payload.notes,
          })
        : api.post('/documents', payload);
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/documents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Document updated' : 'Document added');
      onOpenChange(false);
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit document' : 'Add a document'}
      description="Record the reference and validity dates — no file is uploaded or stored."
      submitLabel={isEdit ? 'Save changes' : 'Add document'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      <FormField label="Document name" htmlFor="doc-name" required error={errors.name?.message}>
        <Input
          id="doc-name"
          placeholder="Insurance policy — MH12AB1234"
          invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
      </FormField>

      <FormGrid>
        <FormField label="Type" required>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as DocumentValues['type'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanise(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Belongs to" required>
          <Select
            value={ownerType}
            onValueChange={(value) => form.setValue('ownerType', value as DocumentValues['ownerType'])}
            disabled={isEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanise(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      {!isEdit && ownerType === 'TRUCK' ? (
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
      ) : null}

      {!isEdit && ownerType === 'DRIVER' && isStaff ? (
        <FormField label="Driver" required error={errors.driver?.message}>
          <Select value={form.watch('driver')} onValueChange={(value) => form.setValue('driver', value)}>
            <SelectTrigger invalid={Boolean(errors.driver)}>
              <SelectValue placeholder="Choose a driver" />
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

      {!isEdit && ownerType === 'TRIP' ? (
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
      ) : null}

      <FormGrid>
        <FormField label="Reference number" htmlFor="doc-ref" hint="Policy, permit or licence number.">
          <Input id="doc-ref" placeholder="POL/2025/482913" {...form.register('referenceNumber')} />
        </FormField>

        <FormField label="Issued by" htmlFor="doc-issuer">
          <Input id="doc-issuer" placeholder="Regional Transport Office" {...form.register('issuedBy')} />
        </FormField>

        <FormField label="Issue date" htmlFor="doc-issued">
          <Input id="doc-issued" type="date" {...form.register('issueDate')} />
        </FormField>

        <FormField label="Expiry date" htmlFor="doc-expiry" hint="Drives the compliance warnings.">
          <Input id="doc-expiry" type="date" {...form.register('expiryDate')} />
        </FormField>
      </FormGrid>

      <FormField label="Notes" htmlFor="doc-notes">
        <Textarea id="doc-notes" rows={2} {...form.register('notes')} />
      </FormField>
    </ResourceDialog>
  );
}

function RejectDocumentDialog({
  document,
  onOpenChange,
}: {
  document: DocumentRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (document) {
      setReason('');
      setError(null);
    }
  }, [document]);

  const reject = useMutation({
    mutationFn: () => api.post(`/documents/${document!.id}/reject`, { reason }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/documents'] });
      toast.success('Document rejected');
      onOpenChange(false);
    },
    onError: (mutationError) => setError(errorMessage(mutationError, 'Could not reject this document.')),
  });

  return (
    <ResourceDialog
      open={Boolean(document)}
      onOpenChange={onOpenChange}
      title="Reject this document"
      description={document?.name}
      submitLabel="Reject document"
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
      <FormField label="Reason for rejection" htmlFor="doc-reject" required hint="Shown to whoever added it.">
        <Textarea
          id="doc-reject"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The reference number does not match the policy on file."
          autoFocus
        />
      </FormField>
    </ResourceDialog>
  );
}

