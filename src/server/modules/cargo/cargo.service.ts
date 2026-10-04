import type { Ctx } from '../../api/context';
import { Cargo } from '../../models/Cargo';
import { Trip } from '../../models/Trip';
import { nextCode } from '../../models/Counter';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
  type ListQuery,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import type { CreateCargoInput, UpdateCargoInput } from './cargo.validation';

const SEARCH_FIELDS = [
  'cargoCode',
  'description',
  'shipperName',
  'consigneeName',
  'origin',
  'destination',
];
const SORT_FIELDS = ['createdAt', 'cargoCode', 'weightTons', 'status', 'declaredValue'];

type CargoListQuery = ListQuery & { status?: string; type?: string; trip?: string; unassigned?: boolean };

export async function listCargo(query: CargoListQuery) {
  const { sortBy, sortDir } = resolveSort(query, SORT_FIELDS);

  const filter = mergeFilters(
    query.status ? { status: query.status } : null,
    query.type ? { type: query.type } : null,
    query.trip ? { trip: query.trip } : null,
    query.unassigned ? { trip: null } : null,
    searchFilter(query.search, SEARCH_FIELDS),
    dateRangeFilter('createdAt', query.from, query.to),
  );

  return paginate(Cargo, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'trip', select: 'tripCode status pickupLocation deliveryLocation' },
  });
}

export async function getCargo(id: string) {
  const cargo = await Cargo.findById(id).populate('trip', 'tripCode status pickupLocation deliveryLocation');
  if (!cargo) throw ApiError.notFound('That cargo record could not be found');
  return cargo;
}

export async function createCargo(input: CreateCargoInput, ctx: Ctx) {
  const actor = ctx.user;
  const cargoCode = await nextCode('CRG');

  if (input.trip) await assertTripOpen(input.trip);

  const cargo = await Cargo.create({
    ...input,
    cargoCode,
    status: input.trip ? 'ASSIGNED' : input.status,
    createdBy: actor._id,
  });

  if (input.trip) await Trip.updateOne({ _id: input.trip }, { $addToSet: { cargo: cargo._id } });

  await recordAudit({
    ctx,
    action: 'CARGO_CREATED',
    summary: `${actor.name} registered cargo ${cargo.cargoCode} (${cargo.weightTons}t ${cargo.origin} â†’ ${cargo.destination})`,
    entity: 'Cargo',
    entityId: cargo._id,
  });

  return cargo;
}

export async function updateCargo(id: string, input: UpdateCargoInput, ctx: Ctx) {
  const actor = ctx.user;
  const cargo = await Cargo.findById(id);
  if (!cargo) throw ApiError.notFound('That cargo record could not be found');

  const previousTrip = cargo.trip ? String(cargo.trip) : null;

  if (input.trip !== undefined && input.trip !== previousTrip) {
    if (input.trip) await assertTripOpen(input.trip);
    // Keep both sides of the cargo â†” trip link in step.
    if (previousTrip) await Trip.updateOne({ _id: previousTrip }, { $pull: { cargo: cargo._id } });
    if (input.trip) await Trip.updateOne({ _id: input.trip }, { $addToSet: { cargo: cargo._id } });
  }

  Object.assign(cargo, input);
  if (input.trip !== undefined) {
    cargo.trip = (input.trip ?? null) as never;
    if (!input.status) cargo.status = input.trip ? 'ASSIGNED' : 'PENDING';
  }

  await cargo.save();

  await recordAudit({
    ctx,
    action: 'CARGO_UPDATED',
    summary: `${actor.name} updated cargo ${cargo.cargoCode}`,
    entity: 'Cargo',
    entityId: cargo._id,
  });

  return cargo;
}

export async function deleteCargo(id: string, ctx: Ctx) {
  const actor = ctx.user;
  const cargo = await Cargo.findById(id);
  if (!cargo) throw ApiError.notFound('That cargo record could not be found');

  if (cargo.trip && ['LOADED', 'IN_TRANSIT', 'DELIVERED'].includes(cargo.status)) {
    throw ApiError.conflict('Cargo that is already on the road cannot be deleted');
  }

  if (cargo.trip) await Trip.updateOne({ _id: cargo.trip }, { $pull: { cargo: cargo._id } });
  await Cargo.deleteOne({ _id: cargo._id });

  await recordAudit({
    ctx,
    action: 'CARGO_DELETED',
    summary: `${actor.name} deleted cargo ${cargo.cargoCode}`,
    entity: 'Cargo',
    entityId: cargo._id,
  });

  return { id };
}

async function assertTripOpen(tripId: string) {
  const trip = await Trip.findById(tripId).select('status tripCode');
  if (!trip) throw ApiError.badRequest('The selected trip could not be found');
  if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict(`Trip ${trip.tripCode} is already ${trip.status.toLowerCase()}`);
  }
  return trip;
}


