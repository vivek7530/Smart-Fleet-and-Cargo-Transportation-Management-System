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
import {
  managerFilterFor,
  requireTripAccess,
  requireTruckAccess,
  truckScopeFilter,
} from '../../services/ownership.service';
import { isAdmin } from '../../lib/ownership';
import { advanceTruckOdometer } from '../../services/odometer.service';

const PAYMENT_MODES = ['CASH', 'CARD', 'FUEL_CARD', 'CREDIT', 'UPI'] as const;

export const createFuelSchema = z.object({
  truck: objectId,
  trip: objectId.nullable().optional(),
  date: dateString,
  litres: z.coerce.number().min(0.1, 'Litres must be greater than zero').max(2000),
  pricePerLitre: z.coerce.number().min(0.1, 'Price per litre is required').max(10000),
  odometerKm: z.coerce.number().finite().min(0).multipleOf(0.1).optional(),
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
  /** Administrative: everything belonging to one manager. Ignored for anyone else. */
  manager: objectId.optional(),
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
    // Fuel belongs to the truck it went into.
    ctx.user.role === 'DRIVER' ? null : await truckScopeFilter(ctx.user),
    query.truck ? { truck: query.truck } : null,
    query.trip ? { trip: query.trip } : null,
    query.paymentMode ? { paymentMode: query.paymentMode } : null,
    isAdmin(ctx.user) && query.manager ? await managerFilterFor(query.manager, { truck: 'truck' }) : null,
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
  // A driver may only log fuel against the truck they are responsible for; a
  // manager, only against a truck they hold. Fuel also advances the truck's
  // odometer, so this writes to the vehicle itself.
  let truck;
  if (ctx.user.role === 'DRIVER') {
    truck = await Truck.findById(input.truck).select('truckNumber assignedDriver odometerKm');
    if (!truck) throw ApiError.badRequest('The selected truck could not be found');
    if (String(truck.assignedDriver) !== String(ctx.user._id)) {
      throw ApiError.forbidden('You can only record fuel for the truck assigned to you');
    }
  } else {
    truck = await requireTruckAccess(input.truck, ctx.user);
  }
  if (input.trip) {
    const trip = await assertTripAccessible(input.trip, ctx);
    if (String(trip.truck) !== String(truck._id)) throw ApiError.validation('The selected trip does not use this truck');
  }
  if (input.odometerKm != null) {
    if (input.odometerKm < truck.odometerKm) {
      throw ApiError.validation(`Fuel odometer cannot be below the truck's latest verified value (${truck.odometerKm} km)`);
    }
    await advanceTruckOdometer(String(truck._id), input.odometerKm);
  }

  const record = await FuelRecord.create({
    ...input,
    date: new Date(input.date),
    driver: ctx.user.role === 'DRIVER' ? ctx.user._id : (truck.assignedDriver ?? null),
    totalCost: input.litres * input.pricePerLitre,
    createdBy: ctx.user._id,
  });

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

  const targetTruckId = input.truck ?? String(record.truck);
  const targetTripId = input.trip === undefined ? (record.trip ? String(record.trip) : null) : input.trip;
  // Both the record's current truck and the one it is being moved to must be
  // reachable, or a record could be walked out of this manager's fleet.
  if (ctx.user.role !== 'DRIVER') {
    await requireTruckAccess(String(record.truck), ctx.user);
  }
  const targetTruck =
    ctx.user.role === 'DRIVER'
      ? await Truck.findById(targetTruckId).select('assignedDriver')
      : await requireTruckAccess(targetTruckId, ctx.user);
  if (!targetTruck) throw ApiError.badRequest('The selected truck could not be found');
  if (targetTripId) {
    const targetTrip =
      ctx.user.role === 'DRIVER'
        ? await Trip.findById(targetTripId).select('truck status tripCode')
        : await requireTripAccess(targetTripId, ctx.user);
    if (!targetTrip) throw ApiError.badRequest('The selected trip could not be found');
    if (String(targetTrip.truck) !== String(targetTruck._id)) {
      throw ApiError.validation('The selected trip does not use this truck');
    }
    if (targetTrip.status === 'CANCELLED') throw ApiError.conflict('Fuel cannot be attached to a cancelled trip');
  }
  if (input.odometerKm !== undefined && record.odometerKm !== undefined && input.odometerKm !== record.odometerKm) {
    throw ApiError.conflict('Submitted fuel odometer readings cannot be edited; use the authorized correction workflow');
  }

  if (input.odometerKm !== undefined && record.odometerKm === undefined) {
    const truckId = String(input.truck ?? record.truck);
    const truck = await Truck.findById(truckId).select('odometerKm');
    if (!truck) throw ApiError.notFound('The truck for this fuel record could not be found');
    if (input.odometerKm < truck.odometerKm) throw ApiError.validation('Fuel odometer cannot be below the latest verified truck reading');
    await advanceTruckOdometer(truckId, input.odometerKm);
  }

  const previousTrip = record.trip ? String(record.trip) : null;
  const previousTruck = String(record.truck);
  if (input.truck !== undefined && String(input.truck) !== previousTruck && record.odometerKm != null) {
    throw ApiError.conflict('A fuel entry with a verified odometer cannot be moved to another truck');
  }
  Object.assign(record, input);
  if (input.truck !== undefined) record.truck = targetTruck._id;
  if (input.trip !== undefined) record.trip = input.trip as never;
  if (input.truck !== undefined && String(input.truck) !== previousTruck) record.driver = targetTruck.assignedDriver ?? null;
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
  if (ctx.user.role !== 'DRIVER') await requireTruckAccess(String(record.truck), ctx.user);

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
  const trip = await Trip.findById(tripId).select('driver truck status tripCode');
  if (!trip) throw ApiError.badRequest('The selected trip could not be found');
  if (ctx.user.role === 'DRIVER' && String(trip.driver) !== String(ctx.user._id)) {
    throw ApiError.forbidden('That trip is not assigned to you');
  }
  return trip;
}
