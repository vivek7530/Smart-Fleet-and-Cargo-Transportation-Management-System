'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { Page, Truck, UserRecord } from '@/lib/types';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField, FormGrid, FormSection } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TRUCK_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_TRIP', 'MAINTENANCE', 'INACTIVE'] as const;
const FUEL_TYPES = ['DIESEL', 'PETROL', 'CNG', 'LNG', 'ELECTRIC'] as const;

const truckSchema = z.object({
  truckNumber: z.string().trim().min(3, 'Truck number is required').max(24),
  registrationNumber: z.string().trim().min(4, 'Registration number is required').max(24),
  make: z.string().trim().min(1, 'Make is required').max(60),
  model: z.string().trim().min(1, 'Model is required').max(60),
  year: z.coerce
    .number({ invalid_type_error: 'Enter a valid year' })
    .int()
    .min(1980, 'Year must be 1980 or later')
    .max(new Date().getFullYear() + 1, 'Year cannot be in the future'),
  capacityTons: z.coerce
    .number({ invalid_type_error: 'Enter the capacity in tons' })
    .min(0.5, 'Capacity must be at least 0.5 tons')
    .max(200),
  fuelType: z.enum(FUEL_TYPES),
  status: z.enum(TRUCK_STATUSES),
  assignedDriver: z.string().optional(),
  odometerKm: z.coerce.number().min(0, 'Odometer cannot be negative').optional(),
  mileageKmPerLitre: z.union([z.literal(''), z.coerce.number().min(0).max(100)]).optional(),
  insuranceProvider: z.string().trim().max(120).optional(),
  insurancePolicyNumber: z.string().trim().max(60).optional(),
  insuranceExpiry: z.string().optional(),
  registrationExpiry: z.string().optional(),
  fitnessExpiry: z.string().optional(),
  permitExpiry: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  purchaseVendor: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type TruckValues = z.infer<typeof truckSchema>;

const emptyValues: TruckValues = {
  truckNumber: '',
  registrationNumber: '',
  make: '',
  model: '',
  year: new Date().getFullYear(),
  capacityTons: 20,
  fuelType: 'DIESEL',
  status: 'AVAILABLE',
  assignedDriver: 'NONE',
  odometerKm: 0,
  mileageKmPerLitre: '',
  insuranceProvider: '',
  insurancePolicyNumber: '',
  insuranceExpiry: '',
  registrationExpiry: '',
  fitnessExpiry: '',
  permitExpiry: '',
  purchaseDate: '',
  purchasePrice: '',
  purchaseVendor: '',
  notes: '',
};

export function TruckFormDialog({
  open,
  onOpenChange,
  truck,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truck?: Truck | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(truck);

  const form = useForm<TruckValues>({ resolver: zodResolver(truckSchema), defaultValues: emptyValues });
  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof TruckValues>((field, message) =>
    form.setError(field, { message }),
  );

  // Only active drivers can hold a truck, so the picker asks for exactly those.
  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'picker'],
    queryFn: () => api.get<Page<UserRecord>>('/drivers', { limit: 100, status: 'ACTIVE' }),
    enabled: open,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    form.reset(
      truck
        ? {
            truckNumber: truck.truckNumber,
            registrationNumber: truck.registrationNumber,
            make: truck.make,
            model: truck.model,
            year: truck.year,
            capacityTons: truck.capacityTons,
            fuelType: truck.fuelType,
            status: truck.status,
            assignedDriver: truck.assignedDriver?.id ?? 'NONE',
            odometerKm: truck.odometerKm,
            mileageKmPerLitre: truck.mileageKmPerLitre ?? '',
            insuranceProvider: truck.insuranceProvider ?? '',
            insurancePolicyNumber: truck.insurancePolicyNumber ?? '',
            insuranceExpiry: toDateInput(truck.insuranceExpiry),
            registrationExpiry: toDateInput(truck.registrationExpiry),
            fitnessExpiry: toDateInput(truck.fitnessExpiry),
            permitExpiry: toDateInput(truck.permitExpiry),
            purchaseDate: toDateInput(truck.purchaseDate),
            purchasePrice: truck.purchasePrice ?? '',
            purchaseVendor: truck.purchaseVendor ?? '',
            notes: truck.notes ?? '',
          }
        : emptyValues,
    );
  }, [open, truck, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: TruckValues) => {
      const payload = {
        ...values,
        assignedDriver: values.assignedDriver === 'NONE' ? null : values.assignedDriver,
        mileageKmPerLitre: values.mileageKmPerLitre === '' ? undefined : values.mileageKmPerLitre,
        purchasePrice: values.purchasePrice === '' ? undefined : values.purchasePrice,
        // Empty date inputs must be sent as null, not "".
        insuranceExpiry: values.insuranceExpiry || null,
        registrationExpiry: values.registrationExpiry || null,
        fitnessExpiry: values.fitnessExpiry || null,
        permitExpiry: values.permitExpiry || null,
        purchaseDate: values.purchaseDate || null,
      };
      return isEdit
        ? api.patch<{ truck: Truck }>(`/trucks/${truck!.id}`, payload)
        : api.post<{ truck: Truck }>('/trucks', payload);
    },
    onSuccess(result) {
      queryClient.invalidateQueries({ queryKey: ['/trucks'] });
      queryClient.invalidateQueries({ queryKey: ['truck', truck?.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? `Truck ${result.truck.truckNumber} updated` : `Truck ${result.truck.truckNumber} added`);
      onOpenChange(false);
    },
    onError: handleError,
  });

  const submit = form.handleSubmit((values) => {
    setBannerError(null);
    mutation.mutate(values);
  });

  const errors = form.formState.errors;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={isEdit ? `Edit ${truck!.truckNumber}` : 'Add a truck'}
      description={
        isEdit ? 'Update the vehicle details and compliance dates.' : 'Register a new vehicle in the fleet.'
      }
      submitLabel={isEdit ? 'Save changes' : 'Add truck'}
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={submit}
    >
      <FormSection title="Vehicle">
        <FormGrid>
          <FormField label="Truck number" htmlFor="truckNumber" required error={errors.truckNumber?.message}>
            <Input
              id="truckNumber"
              placeholder="MH12AB1234"
              className="uppercase"
              invalid={Boolean(errors.truckNumber)}
              {...form.register('truckNumber')}
            />
          </FormField>

          <FormField
            label="Registration number"
            htmlFor="registrationNumber"
            required
            error={errors.registrationNumber?.message}
          >
            <Input
              id="registrationNumber"
              placeholder="MH12AB1234"
              className="uppercase"
              invalid={Boolean(errors.registrationNumber)}
              {...form.register('registrationNumber')}
            />
          </FormField>

          <FormField label="Make" htmlFor="make" required error={errors.make?.message}>
            <Input id="make" placeholder="Tata Motors" invalid={Boolean(errors.make)} {...form.register('make')} />
          </FormField>

          <FormField label="Model" htmlFor="model" required error={errors.model?.message}>
            <Input id="model" placeholder="Signa 4825.TK" invalid={Boolean(errors.model)} {...form.register('model')} />
          </FormField>

          <FormField label="Year" htmlFor="year" required error={errors.year?.message}>
            <Input id="year" type="number" invalid={Boolean(errors.year)} {...form.register('year')} />
          </FormField>

          <FormField label="Capacity (tons)" htmlFor="capacityTons" required error={errors.capacityTons?.message}>
            <Input
              id="capacityTons"
              type="number"
              step="0.5"
              invalid={Boolean(errors.capacityTons)}
              {...form.register('capacityTons')}
            />
          </FormField>

          <FormField label="Fuel type" error={errors.fuelType?.message}>
            <Select
              value={form.watch('fuelType')}
              onValueChange={(value) => form.setValue('fuelType', value as TruckValues['fuelType'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {humanise(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Status" error={errors.status?.message}>
            <Select
              value={form.watch('status')}
              onValueChange={(value) => form.setValue('status', value as TruckValues['status'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRUCK_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {humanise(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Assigned driver" hint="A driver can hold one truck at a time.">
            <Select
              value={form.watch('assignedDriver') || 'NONE'}
              onValueChange={(value) => form.setValue('assignedDriver', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="No driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No driver</SelectItem>
                {drivers?.items.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Odometer (km)" htmlFor="odometerKm" error={errors.odometerKm?.message}>
            <Input id="odometerKm" type="number" {...form.register('odometerKm')} />
          </FormField>

          <FormField label="Mileage (km/L)" htmlFor="mileageKmPerLitre">
            <Input id="mileageKmPerLitre" type="number" step="0.1" {...form.register('mileageKmPerLitre')} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Compliance" description="Expiry dates drive the document warnings on the dashboard.">
        <FormGrid>
          <FormField label="Insurance provider" htmlFor="insuranceProvider">
            <Input id="insuranceProvider" {...form.register('insuranceProvider')} />
          </FormField>
          <FormField label="Policy number" htmlFor="insurancePolicyNumber">
            <Input id="insurancePolicyNumber" {...form.register('insurancePolicyNumber')} />
          </FormField>
          <FormField label="Insurance expiry" htmlFor="insuranceExpiry">
            <Input id="insuranceExpiry" type="date" {...form.register('insuranceExpiry')} />
          </FormField>
          <FormField label="Registration expiry" htmlFor="registrationExpiry">
            <Input id="registrationExpiry" type="date" {...form.register('registrationExpiry')} />
          </FormField>
          <FormField label="Fitness expiry" htmlFor="fitnessExpiry">
            <Input id="fitnessExpiry" type="date" {...form.register('fitnessExpiry')} />
          </FormField>
          <FormField label="Permit expiry" htmlFor="permitExpiry">
            <Input id="permitExpiry" type="date" {...form.register('permitExpiry')} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Purchase">
        <FormGrid>
          <FormField label="Purchase date" htmlFor="purchaseDate">
            <Input id="purchaseDate" type="date" {...form.register('purchaseDate')} />
          </FormField>
          <FormField label="Purchase price (₹)" htmlFor="purchasePrice">
            <Input id="purchasePrice" type="number" {...form.register('purchasePrice')} />
          </FormField>
          <FormField label="Vendor" htmlFor="purchaseVendor" className="sm:col-span-2">
            <Input id="purchaseVendor" {...form.register('purchaseVendor')} />
          </FormField>
        </FormGrid>

        <FormField label="Notes" htmlFor="notes" error={errors.notes?.message}>
          <Textarea id="notes" rows={3} placeholder="Anything the team should know about this vehicle…" {...form.register('notes')} />
        </FormField>
      </FormSection>
    </ResourceDialog>
  );
}
