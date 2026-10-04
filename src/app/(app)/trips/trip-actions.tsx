'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, PackageCheck, PlayCircle } from '@/components/icons';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { humanise } from '@/lib/utils';
import { toDateInput } from '@/lib/format';
import type { Trip, TripStatus } from '@/lib/types';
import { ResourceDialog } from '@/components/data/resource-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Forward transitions the API will accept, mirrored for the UI. */
export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  PLANNED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['LOADING', 'IN_TRANSIT', 'CANCELLED'],
  LOADING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function useTripInvalidation(tripId?: string) {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/trips'] });
    queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar-counts'] });
    queryClient.invalidateQueries({ queryKey: ['/trucks'] });
  }, [queryClient, tripId]);
}

/** Moves a trip to the next lifecycle state (loading, delivered, …). */
export function useChangeTripStatus(trip?: Trip | null) {
  const invalidate = useTripInvalidation(trip?.id);

  return useMutation({
    mutationFn: (input: { status: TripStatus; note?: string }) =>
      api.post<{ trip: Trip }>(`/trips/${trip!.id}/status`, input),
    onSuccess(result) {
      invalidate();
      toast.success(`Trip ${result.trip.tripCode} moved to ${humanise(result.trip.status).toLowerCase()}`);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the trip status.')),
  });
}

export function StartTripDialog({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useTripInvalidation(trip?.id);
  const [note, setNote] = React.useState('');
  const [odometer, setOdometer] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setNote('');
      setOdometer('');
      setError(null);
    }
  }, [open]);

  const start = useMutation({
    mutationFn: () =>
      api.post<{ trip: Trip }>(`/trips/${trip!.id}/start`, {
        note: note || undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
      }),
    onSuccess(result) {
      invalidate();
      toast.success(`Trip ${result.trip.tripCode} started`);
      onOpenChange(false);
    },
    onError: (mutationError) => setError(errorMessage(mutationError, 'Could not start this trip.')),
  });

  if (!trip) return null;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Start trip ${trip.tripCode}`}
      description={`${trip.pickupLocation} → ${trip.deliveryLocation}`}
      submitLabel="Start trip"
      loading={start.isPending}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start.mutate();
      }}
    >
      <div className="rounded-lg border bg-muted/40 px-3.5 py-3 text-[13px] text-muted-foreground">
        Starting the trip marks it as in transit and puts{' '}
        <span className="font-medium text-foreground">{trip.truck?.truckNumber ?? 'the truck'}</span> on the road.
      </div>

      <FormField label="Odometer reading (km)" htmlFor="start-odometer" hint="Optional — keeps the truck's mileage accurate.">
        <Input
          id="start-odometer"
          type="number"
          value={odometer}
          onChange={(event) => setOdometer(event.target.value)}
          placeholder="e.g. 148230"
        />
      </FormField>

      <FormField label="Note" htmlFor="start-note">
        <Textarea
          id="start-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Departed depot at 06:30, cargo sealed."
        />
      </FormField>
    </ResourceDialog>
  );
}

export function CompleteTripDialog({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useTripInvalidation(trip?.id);
  const [deliveredOn, setDeliveredOn] = React.useState('');
  const [odometer, setOdometer] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDeliveredOn(toDateInput(trip?.actualDeliveryDate ?? new Date()));
      setOdometer('');
      setNote('');
      setError(null);
    }
  }, [open, trip]);

  const complete = useMutation({
    mutationFn: () =>
      api.post<{ trip: Trip }>(`/trips/${trip!.id}/complete`, {
        actualDeliveryDate: deliveredOn ? new Date(deliveredOn).toISOString() : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
        note: note || undefined,
      }),
    onSuccess(result) {
      invalidate();
      toast.success(`Trip ${result.trip.tripCode} completed`, {
        description: 'Revenue, costs and profit have been finalised.',
      });
      onOpenChange(false);
    },
    onError: (mutationError) => setError(errorMessage(mutationError, 'Could not complete this trip.')),
  });

  if (!trip) return null;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Complete trip ${trip.tripCode}`}
      description="Closing the trip finalises its financials and frees the truck."
      submitLabel="Complete trip"
      loading={complete.isPending}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        complete.mutate();
      }}
    >
      <div className="rounded-lg border bg-muted/40 px-3.5 py-3 text-[13px] text-muted-foreground">
        Every driver expense on this trip must be approved or rejected first — the API will refuse otherwise.
      </div>

      <FormField label="Actual delivery date" htmlFor="delivered-on">
        <Input
          id="delivered-on"
          type="date"
          value={deliveredOn}
          onChange={(event) => setDeliveredOn(event.target.value)}
        />
      </FormField>

      <FormField label="Closing odometer (km)" htmlFor="complete-odometer">
        <Input
          id="complete-odometer"
          type="number"
          value={odometer}
          onChange={(event) => setOdometer(event.target.value)}
        />
      </FormField>

      <FormField label="Closing note" htmlFor="complete-note">
        <Textarea
          id="complete-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="POD collected and filed."
        />
      </FormField>
    </ResourceDialog>
  );
}

export function CancelTripDialog({
  trip,
  onOpenChange,
}: {
  trip: Trip | null;
  onOpenChange: (open: boolean) => void;
}) {
  const invalidate = useTripInvalidation(trip?.id);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (trip) {
      setReason('');
      setError(null);
    }
  }, [trip]);

  const cancel = useMutation({
    mutationFn: () => api.post<{ trip: Trip }>(`/trips/${trip!.id}/cancel`, { reason }),
    onSuccess(result) {
      invalidate();
      toast.success(`Trip ${result.trip.tripCode} cancelled`);
      onOpenChange(false);
    },
    onError: (mutationError) => setError(errorMessage(mutationError, 'Could not cancel this trip.')),
  });

  return (
    <ResourceDialog
      open={Boolean(trip)}
      onOpenChange={onOpenChange}
      title={`Cancel trip ${trip?.tripCode ?? ''}`}
      description="The driver is notified and any attached cargo is released."
      submitLabel="Cancel trip"
      submitVariant="destructive"
      cancelLabel="Keep trip"
      loading={cancel.isPending}
      error={error}
      submitDisabled={reason.trim().length < 3}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        cancel.mutate();
      }}
    >
      <FormField
        label="Reason for cancelling"
        htmlFor="cancel-reason"
        required
        hint="Stored on the trip and shown to the driver."
      >
        <Textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Consignor withdrew the booking."
          autoFocus
        />
      </FormField>
    </ResourceDialog>
  );
}

/** The primary lifecycle button for the current trip state. */
export function TripLifecycleActions({
  trip,
  canManage,
  canDrive,
  onStart,
  onComplete,
}: {
  trip: Trip;
  canManage: boolean;
  canDrive: boolean;
  onStart: () => void;
  onComplete: () => void;
}) {
  const changeStatus = useChangeTripStatus(trip);
  const nextStates = TRIP_TRANSITIONS[trip.status] ?? [];

  const buttons: React.ReactNode[] = [];

  if (nextStates.includes('LOADING') && (canManage || canDrive)) {
    buttons.push(
      <Button
        key="loading"
        variant="outline"
        onClick={() => changeStatus.mutate({ status: 'LOADING' })}
        loading={changeStatus.isPending && changeStatus.variables?.status === 'LOADING'}
      >
        <PackageCheck />
        Start loading
      </Button>,
    );
  }

  if (nextStates.includes('IN_TRANSIT') && (canManage || canDrive)) {
    buttons.push(
      <Button key="start" onClick={onStart}>
        <PlayCircle />
        Start trip
      </Button>,
    );
  }

  if (nextStates.includes('DELIVERED') && (canManage || canDrive)) {
    buttons.push(
      <Button
        key="delivered"
        onClick={() => changeStatus.mutate({ status: 'DELIVERED' })}
        loading={changeStatus.isPending && changeStatus.variables?.status === 'DELIVERED'}
      >
        <CircleDot />
        Mark delivered
      </Button>,
    );
  }

  if (nextStates.includes('COMPLETED') && canManage) {
    buttons.push(
      <Button key="complete" variant="success" onClick={onComplete}>
        <CheckCircle2 />
        Complete trip
      </Button>,
    );
  }

  if (buttons.length === 0) return null;
  return <>{buttons}</>;
}
