import { z } from 'zod';
import { TransportationCost } from '../../models/TransportationCost';
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
import { TRANSPORTATION_COST_TYPES } from '../../types/enums';
import { dateString, objectId } from '../shared';
import type { Ctx } from '../../api/context';

export const createCostSchema = z.object({
  trip: objectId,
  type: z.enum(TRANSPORTATION_COST_TYPES),
  amount: z.coerce.number().min(0, 'Amount cannot be negative'),
  date: dateString,
  description: z.string().trim().max(1000).optional(),
  vendor: z.string().trim().max(160).optional(),
});

export const updateCostSchema = createCostSchema.partial();

export const listCostsQuerySchema = listQuerySchema.extend({
  trip: objectId.optional(),
  type: z.enum(TRANSPORTATION_COST_TYPES).optional(),
});

const POPULATE = [
  { path: 'trip', select: 'tripCode status pickupLocation deliveryLocation' },
  { path: 'truck', select: 'truckNumber' },
];

export async function listTransportationCosts(query: z.infer<typeof listCostsQuerySchema>) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'date', 'amount', 'type'], 'date');

  const filter = mergeFilters(
    query.trip ? { trip: query.trip } : null,
    query.type ? { type: query.type } : null,
    searchFilter(query.search, ['description', 'vendor']),
    dateRangeFilter('date', query.from, query.to),
  );

  return paginate(TransportationCost, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

export async function createTransportationCost(input: z.infer<typeof createCostSchema>, ctx: Ctx) {
  const trip = await Trip.findById(input.trip).select('tripCode truck status');
  if (!trip) throw ApiError.badRequest('The selected trip could not be found');
  if (trip.status === 'CANCELLED') throw ApiError.conflict('Costs cannot be added to a cancelled trip');

  const record = await TransportationCost.create({
    ...input,
    date: new Date(input.date),
    truck: trip.truck ?? null,
    createdBy: ctx.user._id,
  });

  await recalculateTripFinancials(String(trip._id));

  await recordAudit({
    ctx,
    action: 'TRANSPORTATION_COST_ADDED',
    summary: `${ctx.user.name} added a ₹${record.amount} ${record.type.toLowerCase()} cost to trip ${trip.tripCode}`,
    entity: 'TransportationCost',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function updateTransportationCost(id: string, input: z.infer<typeof updateCostSchema>, ctx: Ctx) {
  const record = await TransportationCost.findById(id);
  if (!record) throw ApiError.notFound('That cost entry could not be found');

  Object.assign(record, input);
  if (input.date) record.date = new Date(input.date);
  await record.save();
  await recalculateTripFinancials(String(record.trip));

  await recordAudit({
    ctx,
    action: 'TRANSPORTATION_COST_UPDATED',
    summary: `${ctx.user.name} updated a transportation cost entry`,
    entity: 'TransportationCost',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function deleteTransportationCost(id: string, ctx: Ctx) {
  const record = await TransportationCost.findById(id);
  if (!record) throw ApiError.notFound('That cost entry could not be found');

  const tripId = String(record.trip);
  await TransportationCost.deleteOne({ _id: record._id });
  await recalculateTripFinancials(tripId);

  await recordAudit({
    ctx,
    action: 'TRANSPORTATION_COST_DELETED',
    summary: `${ctx.user.name} deleted a transportation cost entry`,
    entity: 'TransportationCost',
    entityId: record._id,
  });

  return { id };
}
