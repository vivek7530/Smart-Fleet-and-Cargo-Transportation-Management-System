'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea } from '@/components/ui/input';

/** Where the reading being corrected was originally recorded. */
export type OdometerSource = 'TRUCK' | 'TRIP_START' | 'TRIP_CLOSE' | 'FUEL' | 'MAINTENANCE';

const SOURCE_LABELS: Record<OdometerSource, string> = {
  TRUCK: "the truck's current reading",
  TRIP_START: "this trip's starting reading",
  TRIP_CLOSE: "this trip's closing reading",
  FUEL: "this fuel record's reading",
  MAINTENANCE: "this service record's reading",
};

/**
 * The audited odometer correction.
 *
 * Fuel, maintenance and trip forms have all refused to edit a submitted
 * reading, each telling the user to "use the authorized correction workflow".
 * The endpoint for it has existed since odometer integrity landed; nothing ever
 * called it, so the instruction pointed at nothing.
 *
 * It is deliberately not an edit. A reading decides mileage, service intervals
 * and resale value, so changing one is a real change to someone's asset — which
 * is why a reason is required and why the whole thing lands in the audit log
 * with the old value beside the new one.
 */
export function OdometerCorrectionDialog({
  open,
  onOpenChange,
  source,
  recordId,
  currentKm,
  /** Query keys to refresh once the correction lands. */
  invalidate = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: OdometerSource;
  recordId: string;
  currentKm?: number | null;
  invalidate?: string[];
}) {
  const queryClient = useQueryClient();
  const [readingKm, setReadingKm] = React.useState('');
  const [reason, setReason] = React.useState('');

  const { bannerError, setBannerError, handleError } = useMutationErrors<'readingKm' | 'reason'>(
    (_field, message) => setBannerError(message),
  );

  React.useEffect(() => {
    if (!open) return;
    setBannerError(null);
    setReadingKm(currentKm != null ? String(currentKm) : '');
    setReason('');
  }, [open, currentKm, setBannerError]);

  const correct = useMutation({
    mutationFn: () =>
      api.post('/odometer/corrections', {
        source,
        recordId,
        readingKm: Number(readingKm),
        reason: reason.trim(),
      }),
    onSuccess() {
      for (const key of ['/trucks', 'truck', '/fuel', '/maintenance', '/trips', 'trip', ...invalidate]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success('Reading corrected', { description: 'The change is recorded in the audit log.' });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const parsed = Number(readingKm);
  const valid = readingKm !== '' && Number.isFinite(parsed) && parsed >= 0 && reason.trim().length >= 5;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Correct the odometer reading"
      description={`Changes ${SOURCE_LABELS[source]}. The previous value, the new one and your reason are kept in the audit log.`}
      submitLabel="Save correction"
      loading={correct.isPending}
      error={bannerError}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        setBannerError(null);
        correct.mutate();
      }}
    >
      <FormField
        label="Corrected reading (km)"
        htmlFor="correction-reading"
        required
        hint={
          currentKm != null
            ? `Currently recorded as ${formatNumber(currentKm)} km.`
            : undefined
        }
      >
        <Input
          id="correction-reading"
          type="number"
          min="0"
          step="0.1"
          value={readingKm}
          onChange={(event) => setReadingKm(event.target.value)}
        />
      </FormField>

      <FormField
        label="Why is it being corrected?"
        htmlFor="correction-reason"
        required
        hint="At least a few words. Whoever reads the audit log later will only have this."
      >
        <Textarea
          id="correction-reason"
          rows={3}
          placeholder="Reading was entered as 45,000 instead of 54,000 — confirmed against the trip sheet."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </ResourceDialog>
  );
}
