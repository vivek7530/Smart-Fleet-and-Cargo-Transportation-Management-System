'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatWeight, toDateInput } from '@/lib/format';
import type { Cargo, Page, Trip, Truck, UserRecord } from '@/lib/types';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField, FormGrid, FormSection } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';

const tripSchema = z
  .object({
    truck: z.string().optional(),
    driver: z.string().optional(),
    cargo: z.array(z.string()).default([]),
    pickupLocation: z.string().trim().min(2, 'Pickup location is required').max(200),
    deliveryLocation: z.string().trim().min(2, 'Delivery location is required').max(200),
    distanceKm: z.union([z.literal(''), z.coerce.number().min(0).max(20000)]).optional(),
    startDate: z.string().min(1, 'Choose a start date'),
    expectedDeliveryDate: z.string().min(1, 'Choose an expected delivery date'),
    revenue: z.coerce.number({ invalid_type_error: 'Enter the agreed freight amount' }).min(0, 'Revenue cannot be negative'),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => new Date(data.expectedDeliveryDate).getTime() >= new Date(data.startDate).getTime(),
    { message: 'Delivery must be on or after the start date', path: ['expectedDeliveryDate'] },
  );

type TripValues = z.infer<typeof tripSchema>;

export function TripFormDialog({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip?: Trip | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(trip);

  const form = useForm<TripValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      truck: 'NONE',
      driver: 'NONE',
      cargo: [],
      pickupLocation: '',
      deliveryLocation: '',
      distanceKm: '',
      startDate: toDateInput(new Date()),
      expectedDeliveryDate: toDateInput(new Date(Date.now() + 86_400_000)),
      revenue: 0,
      notes: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof TripValues>((field, message) =>
    form.setError(field as never, { message }),
  );

  // Only vehicles and people that are actually free can be dispatched.
  const { data: trucks } = useQuery({
    queryKey: ['trucks', 'picker'],
    queryFn: () => api.get<Page<Truck>>('/trucks', { limit: 100 }),
    enabled: open,
    staleTime: 30_000,
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'picker'],
    queryFn: () => api.get<Page<UserRecord>>('/drivers', { limit: 100, status: 'ACTIVE' }),
    enabled: open,
    staleTime: 30_000,
  });

  // Unassigned cargo, plus anything already linked to the trip being edited.
  const { data: cargoOptions } = useQuery({
    queryKey: ['cargo', 'picker', trip?.id],
    queryFn: async () => {
      const available = await api.get<Page<Cargo>>('/cargo', { limit: 50, unassigned: 'true' });
      if (!trip?.cargo?.length) return available.items;
      const existing = trip.cargo;
      const merged = [...existing, ...available.items.filter((item) => !existing.some((c) => c.id === item.id))];
      return merged;
    },
    enabled: open,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    if (trip) {
      form.reset({
        truck: trip.truck?.id ?? 'NONE',
        driver: trip.driver?.id ?? 'NONE',
        cargo: trip.cargo?.map((item) => item.id) ?? [],
        pickupLocation: trip.pickupLocation,
        deliveryLocation: trip.deliveryLocation,
        distanceKm: trip.distanceKm ?? '',
        startDate: toDateInput(trip.startDate),
        expectedDeliveryDate: toDateInput(trip.expectedDeliveryDate),
        revenue: trip.revenue,
        notes: trip.notes ?? '',
      });
    }
  }, [open, trip, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: TripValues) => {
      const payload = {
        ...values,
        truck: values.truck === 'NONE' ? null : values.truck,
        driver: values.driver === 'NONE' ? null : values.driver,
        distanceKm: values.distanceKm === '' ? undefined : values.distanceKm,
        startDate: new Date(values.startDate).toISOString(),
        expectedDeliveryDate: new Date(values.expectedDeliveryDate).toISOString(),
      };
      return isEdit
        ? api.patch<{ trip: Trip }>(`/trips/${trip!.id}`, payload)
        : api.post<{ trip: Trip }>('/trips', payload);
    },
    onSuccess(result) {
      queryClient.invalidateQueries({ queryKey: ['/trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', trip?.id] });
      queryClient.invalidateQueries({ queryKey: ['/cargo'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? `Trip ${result.trip.tripCode} updated` : `Trip ${result.trip.tripCode} created`);
      onOpenChange(false);
    },
    onError: handleError,
  });

  const submit = form.handleSubmit((values) => {
    setBannerError(null);
    mutation.mutate(values);
  });

  const errors = form.formState.errors;
  const selectedCargo = form.watch('cargo') ?? [];

  const toggleCargo = (id: string) => {
    const current = form.getValues('cargo') ?? [];
    form.setValue(
      'cargo',
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
      { shouldDirty: true },
    );
  };

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? `Edit trip ${trip!.tripCode}` : 'Create a trip'}
      description={
        isEdit
          ? 'Update the route, assignment and freight amount.'
          : 'Assign a truck and driver now, or leave them blank and dispatch later.'
      }
      submitLabel={isEdit ? 'Save changes' : 'Create trip'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={submit}
    >
      <FormSection title="Route">
        <FormGrid>
          <FormField label="Pickup location" htmlFor="pickupLocation" required error={errors.pickupLocation?.message}>
            <Input
              id="pickupLocation"
              placeholder="Mumbai, MH"
              invalid={Boolean(errors.pickupLocation)}
              {...form.register('pickupLocation')}
            />
          </FormField>

          <FormField
            label="Delivery location"
            htmlFor="deliveryLocation"
            required
            error={errors.deliveryLocation?.message}
          >
            <Input
              id="deliveryLocation"
              placeholder="Delhi, DL"
              invalid={Boolean(errors.deliveryLocation)}
              {...form.register('deliveryLocation')}
            />
          </FormField>

          <FormField label="Start date" htmlFor="startDate" required error={errors.startDate?.message}>
            <Input id="startDate" type="date" invalid={Boolean(errors.startDate)} {...form.register('startDate')} />
          </FormField>

          <FormField
            label="Expected delivery"
            htmlFor="expectedDeliveryDate"
            required
            error={errors.expectedDeliveryDate?.message}
          >
            <Input
              id="expectedDeliveryDate"
              type="date"
              invalid={Boolean(errors.expectedDeliveryDate)}
              {...form.register('expectedDeliveryDate')}
            />
          </FormField>

          <FormField label="Distance (km)" htmlFor="distanceKm" error={errors.distanceKm?.message}>
            <Input id="distanceKm" type="number" placeholder="1420" {...form.register('distanceKm')} />
          </FormField>

          <FormField
            label="Freight revenue (₹)"
            htmlFor="revenue"
            required
            error={errors.revenue?.message}
            hint="The amount agreed with the consignor."
          >
            <Input id="revenue" type="number" invalid={Boolean(errors.revenue)} {...form.register('revenue')} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Assignment" description="A trip becomes dispatchable once both a truck and a driver are set.">
        <FormGrid>
          <FormField label="Truck" error={errors.truck?.message}>
            <Select value={form.watch('truck') || 'NONE'} onValueChange={(value) => form.setValue('truck', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a truck" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not assigned yet</SelectItem>
                {trucks?.items
                  .filter((truck) => !['INACTIVE'].includes(truck.status) || truck.id === trip?.truck?.id)
                  .map((truck) => (
                    <SelectItem key={truck.id} value={truck.id}>
                      {truck.truckNumber} · {truck.make} {truck.model}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Driver" error={errors.driver?.message}>
            <Select value={form.watch('driver') || 'NONE'} onValueChange={(value) => form.setValue('driver', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Not assigned yet</SelectItem>
                {drivers?.items.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Cargo" description="Pick the consignments travelling on this trip.">
        {!cargoOptions?.length ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">
            No unassigned cargo available. Register cargo first, then attach it here.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-1.5">
            {cargoOptions.map((item) => {
              const checked = selectedCargo.includes(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 transition-colors',
                      checked ? 'bg-primary-soft' : 'hover:bg-muted/60',
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleCargo(item.id)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13px] font-medium">
                        <span className="tabular">{item.cargoCode}</span>
                        <Badge variant="neutral" size="sm">
                          {formatWeight(item.weightTons)}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.description} · {item.origin} → {item.destination}
                      </span>
                    </span>
                    {checked ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {selectedCargo.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="size-3.5" />
            {selectedCargo.length} consignment{selectedCargo.length === 1 ? '' : 's'} selected
          </p>
        ) : null}
      </FormSection>

      <FormField label="Notes" htmlFor="notes" error={errors.notes?.message}>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Special instructions, contact details, delivery window…"
          {...form.register('notes')}
        />
      </FormField>
    </ResourceDialog>
  );
}
