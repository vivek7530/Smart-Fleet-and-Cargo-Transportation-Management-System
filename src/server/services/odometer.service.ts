import { Truck } from '../models/Truck';
import { ApiError } from '../lib/ApiError';
import { z } from 'zod';
import { Trip } from '../models/Trip';
import { FuelRecord } from '../models/FuelRecord';
import { Maintenance } from '../models/Maintenance';
import type { Ctx } from '../api/context';
import { recordAudit } from './audit.service';

export const odometerCorrectionSchema = z.object({
  source: z.enum(['TRUCK', 'TRIP_START', 'TRIP_CLOSE', 'FUEL', 'MAINTENANCE']),
  recordId: z.string().regex(/^[a-f\d]{24}$/i),
  readingKm: z.coerce.number().finite().min(0).multipleOf(0.1),
  reason: z.string().trim().min(5, 'Give a correction reason').max(500),
});

/** Atomically advances a truck's verified odometer without allowing rollback. */
export async function advanceTruckOdometer(truckId: string, readingKm: number): Promise<void> {
  const result = await Truck.updateOne(
    { _id: truckId, odometerKm: { $lte: readingKm } },
    { $max: { odometerKm: readingKm } },
  );
  if (result.matchedCount === 0) {
    const truck = await Truck.findById(truckId).select('odometerKm');
    if (!truck) throw ApiError.notFound('The truck for this odometer reading could not be found');
    throw ApiError.conflict(`Odometer reading is below the latest verified value (${truck.odometerKm} km)`);
  }
}

/** Corrections are separate from normal editing and retain an audit trail. */
export async function correctOdometer(
  input: z.infer<typeof odometerCorrectionSchema>,
  ctx: Ctx,
) {
  const event = input.source === 'TRIP_START' ? 'START' : 'CLOSE';
  let truckId: string;
  let previousKm: number | undefined;
  let entity = '';
  let entityId = input.recordId;

  if (input.source === 'TRUCK') {
    const truck = await Truck.findById(input.recordId).select('truckNumber odometerKm');
    if (!truck) throw ApiError.notFound('The truck could not be found');
    previousKm = truck.odometerKm;
    truckId = String(truck._id);
    entity = `Truck ${truck.truckNumber} current reading`;
  } else if (input.source === 'TRIP_START' || input.source === 'TRIP_CLOSE') {
    const trip = await Trip.findById(input.recordId);
    if (!trip) throw ApiError.notFound('The trip could not be found');
    const reading = trip.odometerReadings.find((item) => item.event === event);
    if (!reading) throw ApiError.notFound('That trip odometer reading has not been recorded');
    previousKm = reading.valueKm;
    if (event === 'START') {
      const close = trip.odometerReadings.find((item) => item.event === 'CLOSE');
      if (close && input.readingKm > close.valueKm) throw ApiError.validation('Starting odometer cannot exceed the closing reading');
    } else {
      const start = trip.odometerReadings.find((item) => item.event === 'START');
      if (start && input.readingKm < start.valueKm) throw ApiError.validation('Closing odometer must be at least the starting reading');
    }
    reading.valueKm = input.readingKm;
    trip.odometerCorrections.push({
      event, previousKm, correctedKm: input.readingKm, reason: input.reason,
      correctedAt: new Date(), correctedBy: ctx.user._id,
    });
    await trip.save();
    truckId = String(trip.truck);
    entity = `Trip ${trip.tripCode} ${event.toLowerCase()} reading`;
  } else if (input.source === 'FUEL') {
    const record = await FuelRecord.findById(input.recordId);
    if (!record) throw ApiError.notFound('The fuel record could not be found');
    if (record.odometerKm == null) throw ApiError.notFound('That fuel record has no odometer reading');
    previousKm = record.odometerKm;
    record.odometerKm = input.readingKm;
    await record.save();
    truckId = String(record.truck);
    entity = 'Fuel record odometer';
  } else {
    const record = await Maintenance.findById(input.recordId);
    if (!record) throw ApiError.notFound('The maintenance record could not be found');
    if (record.odometerKm == null) throw ApiError.notFound('That maintenance record has no odometer reading');
    previousKm = record.odometerKm;
    record.odometerKm = input.readingKm;
    await record.save();
    truckId = String(record.truck);
    entity = 'Maintenance record odometer';
  }

  if (input.source === 'TRIP_START' || input.source === 'TRIP_CLOSE') {
    const trip = await Trip.findById(input.recordId).select('odometerReadings');
    if (trip) truckId = String(trip.truck);
  }
  if (!truckId || truckId === 'null') throw ApiError.conflict('The odometer record is not linked to a truck');

  // If the corrected value is still the truck's latest value, move the snapshot
  // with it. A newer reading already recorded for this truck remains untouched.
  await Truck.updateOne({ _id: truckId, odometerKm: previousKm }, { $set: { odometerKm: input.readingKm } });
  await recordAudit({
    ctx,
    action: 'ODOMETER_CORRECTED',
    summary: `${ctx.user.name} corrected ${entity} from ${previousKm} km to ${input.readingKm} km`,
    entity: 'OdometerCorrection',
    entityId,
    metadata: { source: input.source, previousKm, correctedKm: input.readingKm, reason: input.reason },
  });
  return { source: input.source, recordId: input.recordId, previousKm, readingKm: input.readingKm };
}
