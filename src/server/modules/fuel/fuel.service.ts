import { z } from 'zod';
import { FuelRecord } from '../../models/FuelRecord';
import { Truck } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  listQuerySchema,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import { recalculateTripFinancials } from '../trips/trips.service';
import { dateString, objectId } from '../shared';
import type { Ctx } from '../../api/context';

const PAYMENT_MODES = ['CASH', 'CARD', 'FUEL_CARD', 'CREDIT', 'UPI'] as const;

export const createFuelSchema = z.object({
  truck: objectId,
  trip: objectId.nullable().optional(),
  date: dateString,
  litres: z.coerce.number().min(0.1, 'Litres must be greater than zero').max(2000),
  pricePerLitre: z.coerce.number().min(0.1, 'Price per litre is required').max(10000),
  odometerKm: z.coerce.number().min(0).optional(),
  station: z.string().trim().max(160).optional(),
  location: z.string().trim().max(160).optional(),
  paymentMode: z.enum(PAYMENT_MODES).default('FUEL_CARD'),
  notes: z.string().trim().max(1000).optional(),
});

export const updateFuelSchema = createFuelSchema.partial();

export const listFuelQuerySchema = listQuerySchema.extend({
  truck: objectId.optional(),
  trip: objectId.optional(),
  driver: objectId.optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
});

const POPULATE = [
  { path: 'truck', select: 'truckNumber registrationNumber make model' },
  { path: 'driver', select: 'name avatarColor' },
  { path: 'trip', select: 'tripCode status' },
];

type ListQuery = z.infer<typeof listFuelQuerySchema>;

export async function listFuel(query: ListQuery, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'date', 'litres', 'totalCost'], 'date');

  const filter = mergeFilters(
    // Drivers only ever see the fuel they recorded themselves.
    ctx.user.role === 'DRIVER' ? { driver: ctx.user._id } : query.driver ? { driver: query.driver } : null,
    query.truck ? { truck: query.truck } : null,
    query.trip ? { trip: query.trip } : null,
    query.paymentMode ? { paymentMode: query.paymentMode } : null,
    searchFilter(query.search, ['station', 'location', 'notes']),
    dateRangeFilter('date', query.from, query.to),
  );

  return paginate(FuelRecord, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

export async function createFuelRecord(input: z.infer<typeof createFuelSchema>, ctx: Ctx) {
  const truck = await Truck.findById(input.truck).select('truckNumber assignedDriver');
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');

  // A driver may only log fuel against the truck they are responsible for.
  if (ctx.user.role === 'DRIVER' && String(truck.assignedDriver) !== String(ctx.user._id)) {
    throw ApiError.forbidden('You can only record fuel for the truck assigned to you');
  }
  if (input.trip) await assertTripAccessible(input.trip, ctx);

  const record = await FuelRecord.create({
    ...input,
    date: new Date(input.date),
    driver: ctx.user.role === 'DRIVER' ? ctx.user._id : (truck.assignedDriver ?? null),
    totalCost: input.litres * input.pricePerLitre,
    createdBy: ctx.user._id,
  });

  if (input.odometerKm != null) await Truck.updateOne({ _id: truck._id }, { odometerKm: input.odometerKm });
  if (record.trip) await recalculateTripFinancials(String(record.trip));

  await recordAudit({
    ctx,
    action: 'FUEL_RECORDED',
    summary: `${ctx.user.name} recorded ${record.litres}L of fuel for truck ${truck.truckNumber} (₹${record.totalCost})`,
    entity: 'FuelRecord',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function updateFuelRecord(id: string, input: z.infer<typeof updateFuelSchema>, ctx: Ctx) {
  const record = await FuelRecord.findById(id);
  if (!record) throw ApiError.notFound('That fuel record could not be found');

  const previousTrip = record.trip ? String(record.trip) : null;
  Object.assign(record, input);
  if (input.date) record.date = new Date(input.date);
  await record.save();

  // Both the old and new trip totals need refreshing when the link moves.
  for (const tripId of new Set([previousTrip, record.trip ? String(record.trip) : null].filter(Boolean))) {
    await recalculateTripFinancials(tripId as string);
  }

  await recordAudit({
    ctx,
    action: 'FUEL_UPDATED',
    summary: `${ctx.user.name} updated a fuel record`,
    entity: 'FuelRecord',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function deleteFuelRecord(id: string, ctx: Ctx) {
  const record = await FuelRecord.findById(id);
  if (!record) throw ApiError.notFound('That fuel record could not be found');

  const tripId = record.trip ? String(record.trip) : null;
  await FuelRecord.deleteOne({ _id: record._id });
  if (tripId) await recalculateTripFinancials(tripId);

  await recordAudit({
    ctx,
    action: 'FUEL_DELETED',
    summary: `${ctx.user.name} deleted a fuel record`,
    entity: 'FuelRecord',
    entityId: record._id,
  });

  return { id };
}

async function assertTripAccessible(tripId: string, ctx: Ctx) {
  const trip = await Trip.findById(tripId).select('driver status tripCode');
  if (!trip) throw ApiError.badRequest('The selected trip could not be found');
  if (ctx.user.role === 'DRIVER' && String(trip.driver) !== String(ctx.user._id)) {
    throw ApiError.forbidden('That trip is not assigned to you');
  }
  return trip;
}
