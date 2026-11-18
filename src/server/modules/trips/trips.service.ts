import type { Ctx } from '../../api/context';
import { Types } from 'mongoose';
import { historicalTripSchema } from './trips.validation';
import type { z } from 'zod';
import { Trip, type TripDocument } from '../../models/Trip';
import { Truck } from '../../models/Truck';
import { Cargo } from '../../models/Cargo';
import { User, type UserDocument } from '../../models/User';
import { DriverExpense } from '../../models/DriverExpense';
import { TransportationCost } from '../../models/TransportationCost';
import { FuelRecord } from '../../models/FuelRecord';
import { DocumentRecord } from '../../models/DocumentRecord';
import { Maintenance } from '../../models/Maintenance';
import { BreakdownReport } from '../../models/BreakdownReport';
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
import { notify } from '../../services/notification.service';
import { recipientsForTruck } from '../../services/ownership.service';
import { TRIP_TRANSITIONS, type TripStatus } from '../../types/enums';
import { indiaDayLabel, staleReasonFor, staleTripFilter } from '../../lib/stale-trips';
import { advanceTruckOdometer } from '../../services/odometer.service';
import {
  assertCanEdit,
  assertCanSee,
  canAccess,
  canSeeFinancials,
  isAdmin,
  ownerScopeFor,
  redactTripFor,
  refId,
  type OwnedLike,
} from '../../lib/ownership';

const SEARCH_FIELDS = ['tripCode', 'pickupLocation', 'deliveryLocation', 'notes'];
const SORT_FIELDS = ['createdAt', 'tripCode', 'startDate', 'expectedDeliveryDate', 'status', 'revenue'];
const ACTIVE_STATUSES: TripStatus[] = ['ASSIGNED', 'LOADING', 'IN_TRANSIT'];

const TRIP_POPULATE = [
  { path: 'truck', select: 'truckNumber registrationNumber make model status capacityTons odometerKm' },
  { path: 'driver', select: 'name mobile email avatarColor licenseNumber' },
  { path: 'cargo', select: 'cargoCode description weightTons type status origin destination' },
];

type TripListQuery = ListQuery & {
  status?: string;
  driver?: string;
  truck?: string;
  manager?: string;
  active?: boolean;
  /** Only the trips the dispatch gate is holding — see `lib/stale-trips`. */
  stale?: boolean;
};

/**
 * Who may see which trips — enforced here, not in the UI.
 *
 * A driver sees the trips assigned to them. A manager sees the trips of the
 * trucks they own or that an administrator shared with them. An administrator
 * sees everything, and `ownerScopeFor` returns `{}` for them.
 */
export function tripScopeFor(user: UserDocument) {
  if (user.role === 'DRIVER') return { driver: user._id };
  return ownerScopeFor(user);
}

export async function listTrips(query: TripListQuery, user: UserDocument) {
  const { sortBy, sortDir } = resolveSort(query, SORT_FIELDS, 'startDate');

  const filter = mergeFilters(
    tripScopeFor(user),
    query.status ? { status: query.status } : null,
    query.active ? { status: { $in: ACTIVE_STATUSES } } : null,
    query.stale ? staleTripFilter() : null,
    query.driver && user.role !== 'DRIVER' ? { driver: query.driver } : null,
    query.truck ? { truck: query.truck } : null,
    // A trip carries its truck's owner, so this is one indexed predicate rather
    // than a lookup. Administrators only: for a manager the scope above already
    // decides what they see, and accepting it would only confirm which manager
    // ids exist.
    isAdmin(user) && query.manager ? { owner: query.manager } : null,
    searchFilter(query.search, SEARCH_FIELDS),
    dateRangeFilter('startDate', query.from, query.to),
  );

  const page = await paginate(Trip, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: TRIP_POPULATE,
  });

  return {
    ...page,
    items: page.items.map((item) => redactTripFor(item, item as OwnedLike, user)),
  };
}

export async function getTrip(id: string, user: UserDocument) {
  const trip = await Trip.findById(id)
    .populate(TRIP_POPULATE)
    .populate('createdBy', 'name role')
    .populate('owner', 'name avatarColor role')
    .populate('inheritedFrom', 'name avatarColor role');
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanSeeTrip(trip, user);

  const [expenses, costs, fuel, documents] = await Promise.all([
    DriverExpense.find({ trip: trip._id }).sort({ date: -1 }).populate('driver', 'name avatarColor'),
    TransportationCost.find({ trip: trip._id }).sort({ date: -1 }),
    FuelRecord.find({ trip: trip._id }).sort({ date: -1 }),
    DocumentRecord.find({ trip: trip._id }).sort({ createdAt: -1 }),
  ]);

  // The cost records are the trip's money in itemised form, so hiding the
  // totals while listing every expense line would achieve nothing.
  const showMoney = canSeeFinancials(trip, user);

  return {
    trip: redactTripFor(trip.toJSON(), trip, user),
    expenses: showMoney ? expenses.map((e) => e.toJSON()) : [],
    transportationCosts: showMoney ? costs.map((c) => c.toJSON()) : [],
    fuelRecords: showMoney ? fuel.map((f) => f.toJSON()) : [],
    documents: documents.map((d) => d.toJSON()),
  };
}

export async function createTrip(input: Record<string, never>, ctx: Ctx) {
  const actor = ctx.user;
  const body = input as unknown as {
    truck?: string | null;
    driver?: string | null;
    cargo: string[];
    pickupLocation: string;
    deliveryLocation: string;
    distanceKm?: number;
    startDate: string;
    expectedDeliveryDate: string;
    revenue: number;
    notes?: string;
  };

  // A trip belongs to whoever owns its truck, so the truck has to be one this
  // user may actually run. Without a truck there is nothing to derive ownership
  // from, so the trip starts owned by the manager planning it.
  const truck = body.truck
    ? await assertTruckUsable(body.truck, new Date(body.startDate), new Date(body.expectedDeliveryDate), undefined, actor)
    : null;

  // Resolved before the driver check, because who the trip belongs to is what
  // decides which drivers may be put on it.
  const owner = truck ? (truck.owner ?? null) : isAdmin(actor) ? null : actor._id;

  if (body.driver) {
    await assertDriverUsable(body.driver, new Date(body.startDate), new Date(body.expectedDeliveryDate), undefined, owner);
  }
  if (body.cargo?.length) await assertCargoAvailable(body.cargo);

  const tripCode = await nextCode('TRP');
  const status: TripStatus = body.truck && body.driver ? 'ASSIGNED' : 'PLANNED';

  const trip = await Trip.create({
    tripCode,
    truck: body.truck ?? null,
    driver: body.driver ?? null,
    cargo: body.cargo ?? [],
    pickupLocation: body.pickupLocation,
    deliveryLocation: body.deliveryLocation,
    distanceKm: body.distanceKm,
    startDate: new Date(body.startDate),
    expectedDeliveryDate: new Date(body.expectedDeliveryDate),
    revenue: body.revenue ?? 0,
    notes: body.notes,
    status,
    // Denormalised from the truck so every list and report stays one query.
    owner,
    sharedWith: truck?.sharedWith ?? [],
    createdBy: actor._id,
    statusHistory: [{ status, at: new Date(), by: actor._id, note: 'Trip created' }],
  });

  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: 'TRIP_CREATED',
    summary: `${actor.name} created trip ${trip.tripCode} (${trip.pickupLocation} → ${trip.deliveryLocation})`,
    entity: 'Trip',
    entityId: trip._id,
    metadata: { revenue: trip.revenue, status },
  });

  if (trip.driver) await notifyDriverOfAssignment(trip);

  return trip.populate(TRIP_POPULATE);
}

/** Admin-only entry path for already completed historical operations. */
export async function createHistoricalTrip(input: z.infer<typeof historicalTripSchema>, ctx: Ctx) {
  const start = new Date(input.actualStartDate);
  const end = new Date(input.actualDeliveryDate);
  const truckId = input.truck ?? null;
  const driverId = input.driver ?? null;

  let owner: unknown = null;
  let inheritedFrom: unknown = null;

  if (truckId) {
    const truck = await Truck.findById(truckId).select('truckNumber owner sharedWith ownerHistory');
    if (!truck) throw ApiError.badRequest('The selected truck could not be found');
    await assertHistoricalResourceAvailable('truck', truckId, start, end, truck.truckNumber);

    // The trip lands under whoever holds the truck now, so it stays with the
    // vehicle. But a historical trip was earned by whoever held the truck at
    // the time — if that is someone else, the money is theirs, not the current
    // owner's, and `ownerHistory` is what records that.
    owner = truck.owner ?? null;
    const earner = ownerAt(truck.ownerHistory, end);
    if (earner !== null && refId(earner) !== refId(truck.owner)) inheritedFrom = earner;
  }
  if (driverId) {
    const driver = await User.findOne({ _id: driverId, role: 'DRIVER' }).select('name');
    if (!driver) throw ApiError.badRequest('The selected driver could not be found');
    await assertHistoricalResourceAvailable('driver', driverId, start, end, driver.name);
  }
  if (input.cargo.length) await assertCargoAvailable(input.cargo);

  const tripCode = await nextCode('TRP');
  const trip = await Trip.create({
    tripCode,
    truck: truckId,
    driver: driverId,
    cargo: input.cargo,
    pickupLocation: input.pickupLocation,
    deliveryLocation: input.deliveryLocation,
    distanceKm: input.distanceKm,
    startDate: start,
    expectedDeliveryDate: end,
    actualDeliveryDate: end,
    startedAt: start,
    completedAt: end,
    revenue: input.revenue,
    notes: input.notes,
    status: 'COMPLETED',
    owner,
    inheritedFrom,
    createdBy: ctx.user._id,
    statusHistory: [
      { status: 'ASSIGNED', at: start, by: ctx.user._id, note: 'Historical record entered' },
      { status: 'IN_TRANSIT', at: start, by: ctx.user._id, note: 'Historical record entered' },
      { status: 'DELIVERED', at: end, by: ctx.user._id, note: 'Historical record entered' },
      { status: 'COMPLETED', at: end, by: ctx.user._id, note: 'Historical record entered' },
    ],
    odometerReadings: [
      { event: 'START', valueKm: input.startOdometerKm, recordedAt: start, recordedBy: ctx.user._id },
      { event: 'CLOSE', valueKm: input.closingOdometerKm, recordedAt: end, recordedBy: ctx.user._id },
    ],
  });

  if (input.cargo.length) {
    await Cargo.updateMany({ _id: { $in: input.cargo } }, { trip: trip._id, status: 'DELIVERED' });
  }
  if (truckId) {
    await Truck.updateOne(
      { _id: truckId, odometerKm: { $lte: input.closingOdometerKm } },
      { $max: { odometerKm: input.closingOdometerKm } },
    );
  }

  await recordAudit({
    ctx,
    action: 'HISTORICAL_TRIP_CREATED',
    summary: `${ctx.user.name} entered completed historical trip ${trip.tripCode}`,
    entity: 'Trip',
    entityId: trip._id,
    metadata: { actualStartDate: start, actualDeliveryDate: end, historicalEntry: true },
  });
  return trip.populate(TRIP_POPULATE);
}

export async function updateTrip(id: string, input: Record<string, unknown>, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);
  if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict(`Trip ${trip.tripCode} is ${trip.status.toLowerCase()} and can no longer be edited`);
  }

  if (['LOADING', 'IN_TRANSIT', 'DELIVERED'].includes(trip.status)) {
    const operationalFieldsChanged =
      (input.truck !== undefined && String(input.truck ?? '') !== String(trip.truck ?? '')) ||
      (input.driver !== undefined && String(input.driver ?? '') !== String(trip.driver ?? '')) ||
      input.cargo !== undefined || input.startDate !== undefined || input.expectedDeliveryDate !== undefined;
    if (operationalFieldsChanged) {
      throw ApiError.conflict('Truck, driver, cargo, and schedule cannot be changed after loading begins. Cancel and create a replacement trip if reassignment is required.');
    }
  }

  const previousDriver = trip.driver ? String(trip.driver) : null;
  const previousTruck = trip.truck ? String(trip.truck) : null;

  // Editing a stale trip is the very thing the dispatch gate asks for, so the
  // gate stands aside for it. Otherwise a resource carrying two stale trips
  // would be stuck: each one would be refused on account of the other, and
  // cancelling would be the only way out. The overlap check below still
  // applies — this only waives the "settle the backlog first" rule.
  const settlingStaleTrip = staleReasonFor(trip) !== null;

  const proposedStart = input.startDate ? new Date(input.startDate as string) : trip.startDate;
  const proposedEnd = input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate as string) : trip.expectedDeliveryDate;
  if (proposedEnd < proposedStart) throw ApiError.validation('Expected delivery must be on or after the start date');
  const proposedTruck = input.truck === undefined ? previousTruck : input.truck as string | null;
  const proposedDriver = input.driver === undefined ? previousDriver : input.driver as string | null;
  // Moving a trip onto a different truck moves who is responsible for it, so
  // the new truck has to be one this user may run — and the trip's owner
  // follows the truck, exactly as it does on a transfer.
  let movedToTruck: Awaited<ReturnType<typeof assertTruckUsable>> | null = null;
  if (proposedTruck && (proposedTruck !== previousTruck || input.startDate || input.expectedDeliveryDate)) {
    movedToTruck = await assertTruckUsable(proposedTruck, proposedStart, proposedEnd, String(trip._id), actor, settlingStaleTrip);
  }
  // The trip's owner follows its truck, exactly as it does on a transfer.
  if (movedToTruck && proposedTruck !== previousTruck) {
    trip.owner = movedToTruck.owner ?? null;
    trip.sharedWith = movedToTruck.sharedWith ?? [];
  }
  if (proposedDriver && (proposedDriver !== previousDriver || input.startDate || input.expectedDeliveryDate)) {
    await assertDriverUsable(proposedDriver, proposedStart, proposedEnd, String(trip._id), trip.owner ?? null, settlingStaleTrip);
  }

  if (Array.isArray(input.cargo)) {
    await assertCargoAvailable(input.cargo as string[], String(trip._id));
    // Detach cargo that is no longer part of this trip.
    await Cargo.updateMany(
      { trip: trip._id, _id: { $nin: input.cargo } },
      { trip: null, status: 'PENDING' },
    );
    trip.cargo = (input.cargo as string[]).map((cargoId) => new Types.ObjectId(cargoId));
  }

  if (input.truck !== undefined) trip.truck = input.truck ? new Types.ObjectId(input.truck as string) : null;
  if (input.driver !== undefined) trip.driver = input.driver ? new Types.ObjectId(input.driver as string) : null;
  if (input.pickupLocation !== undefined) trip.pickupLocation = input.pickupLocation as string;
  if (input.deliveryLocation !== undefined) trip.deliveryLocation = input.deliveryLocation as string;
  if (input.distanceKm !== undefined) trip.distanceKm = input.distanceKm as number;
  if (input.startDate) trip.startDate = new Date(input.startDate as string);
  if (input.expectedDeliveryDate) trip.expectedDeliveryDate = new Date(input.expectedDeliveryDate as string);
  if (input.revenue !== undefined) trip.revenue = input.revenue as number;
  if (input.notes !== undefined) trip.notes = input.notes as string;

  // A planned trip becomes assignable as soon as both a truck and a driver exist.
  if (trip.status === 'PLANNED' && trip.truck && trip.driver) {
    trip.status = 'ASSIGNED';
    trip.statusHistory.push({ status: 'ASSIGNED', at: new Date(), by: actor._id, note: 'Truck and driver assigned' });
  }

  await trip.save();
  await releaseTruckIfUnused(previousTruck, String(trip._id));
  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: 'TRIP_UPDATED',
    summary: `${actor.name} updated trip ${trip.tripCode}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  if (trip.driver && String(trip.driver) !== previousDriver) await notifyDriverOfAssignment(trip);

  return trip.populate(TRIP_POPULATE);
}

/** Moves a trip along the lifecycle, rejecting any transition that is not allowed. */
export async function changeTripStatus(
  id: string,
  nextStatus: TripStatus,
  note: string | undefined,
  ctx: Ctx,
) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);

  if (nextStatus === 'IN_TRANSIT') {
    throw ApiError.conflict('Use the start-trip workflow and record the starting odometer reading');
  }

  // Drivers drive the operational part of the lifecycle but never close the books.
  if (actor.role === 'DRIVER' && !['LOADING', 'IN_TRANSIT', 'DELIVERED'].includes(nextStatus)) {
    throw ApiError.forbidden('Drivers can only update a trip up to delivery');
  }

  assertTransitionAllowed(trip, nextStatus);

  trip.status = nextStatus;
  trip.statusHistory.push({ status: nextStatus, at: new Date(), by: actor._id, note });

  if (nextStatus === 'DELIVERED' && !trip.actualDeliveryDate) trip.actualDeliveryDate = new Date();

  await trip.save();
  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: `TRIP_${nextStatus}`,
    summary: `${actor.name} moved trip ${trip.tripCode} to ${nextStatus.replace('_', ' ').toLowerCase()}`,
    entity: 'Trip',
    entityId: trip._id,
    metadata: { note },
  });

  return trip.populate(TRIP_POPULATE);
}

export async function startTrip(id: string, body: { note?: string; odometerKm: number }, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);

  if (!trip.truck || !trip.driver) {
    throw ApiError.conflict('Assign a truck and a driver before starting this trip');
  }
  if (trip.status === 'IN_TRANSIT') throw ApiError.conflict('This trip has already started');
  if (!['ASSIGNED', 'LOADING'].includes(trip.status)) {
    throw ApiError.conflict(`A trip in "${trip.status}" cannot be started`);
  }
  const unsafeBreakdown = await BreakdownReport.exists({
    truck: trip.truck,
    severity: { $in: ['HIGH', 'CRITICAL'] },
    status: { $nin: ['RESOLVED', 'CANCELLED'] },
  });
  if (unsafeBreakdown) throw ApiError.conflict('Resolve the truck’s high-severity breakdown before starting this trip');
  if (indiaDateKey(trip.startDate) > indiaDateKey(new Date())) {
    throw ApiError.conflict('A trip cannot be started before its planned start date');
  }
  await recordTripOdometer(trip, 'START', body.odometerKm, actor._id);

  trip.status = 'IN_TRANSIT';
  trip.startedAt = new Date();
  trip.statusHistory.push({
    status: 'IN_TRANSIT',
    at: trip.startedAt,
    by: actor._id,
    note: body.note ?? 'Trip started',
  });
  await trip.save();

  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: 'TRIP_STARTED',
    summary: `${actor.name} started trip ${trip.tripCode}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  await notify({
    users: await recipientsForTruck(trip.truck ?? null),
    type: 'TRIP_STARTED',
    title: `Trip ${trip.tripCode} started`,
    message: `${actor.name} started the trip from ${trip.pickupLocation} to ${trip.deliveryLocation}.`,
    link: `/trips/${trip._id}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  return trip.populate(TRIP_POPULATE);
}

/**
 * Closes a trip: recomputes the financials from the underlying records, frees
 * the truck, marks the cargo delivered and stores the final profit.
 */
export async function completeTrip(
  id: string,
  body: { actualDeliveryDate?: string; note?: string; odometerKm: number },
  ctx: Ctx,
) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);

  if (trip.status === 'COMPLETED') throw ApiError.conflict('This trip is already completed');
  if (!['IN_TRANSIT', 'DELIVERED'].includes(trip.status)) {
    throw ApiError.conflict('Only a trip that is in transit or delivered can be completed');
  }

  const pendingExpenses = await DriverExpense.countDocuments({ trip: trip._id, status: 'PENDING' });
  if (pendingExpenses > 0) {
    throw ApiError.conflict(
      `${pendingExpenses} driver expense${pendingExpenses > 1 ? 's are' : ' is'} still awaiting review. Approve or reject them before completing the trip.`,
    );
  }

  const deliveryDate = body.actualDeliveryDate ? new Date(body.actualDeliveryDate) : (trip.actualDeliveryDate ?? new Date());
  const deliveryKey = indiaDateKey(deliveryDate);
  if (trip.startedAt && deliveryKey < indiaDateKey(trip.startedAt)) {
    throw ApiError.validation('Actual delivery cannot be earlier than the actual trip start');
  }
  if (deliveryKey > indiaDateKey(new Date())) {
    throw ApiError.validation('Actual delivery cannot be in the future');
  }
  await recordTripOdometer(trip, 'CLOSE', body.odometerKm, actor._id);
  trip.status = 'COMPLETED';
  trip.completedAt = new Date();
  trip.actualDeliveryDate = deliveryDate;
  trip.statusHistory.push({
    status: 'COMPLETED',
    at: trip.completedAt,
    by: actor._id,
    note: body.note ?? 'Trip completed',
  });

  await trip.save();
  await recalculateTripFinancials(String(trip._id));
  await syncSideEffectsForStatus(trip);

  const settled = await Trip.findById(trip._id).populate(TRIP_POPULATE);

  await recordAudit({
    ctx,
    action: 'TRIP_COMPLETED',
    summary: `${actor.name} completed trip ${trip.tripCode} — revenue ₹${settled?.revenue ?? 0}, profit ₹${settled?.profit ?? 0}`,
    entity: 'Trip',
    entityId: trip._id,
    metadata: {
      revenue: settled?.revenue,
      expenses: settled?.totalExpenses,
      profit: settled?.profit,
    },
  });

  await notify({
    users: [trip.driver, ...(await recipientsForTruck(trip.truck ?? null))],
    type: 'TRIP_COMPLETED',
    title: `Trip ${trip.tripCode} completed`,
    message: `The trip from ${trip.pickupLocation} to ${trip.deliveryLocation} has been completed.`,
    link: `/trips/${trip._id}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  return settled!;
}

export async function cancelTrip(id: string, reason: string, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);
  if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict(`Trip ${trip.tripCode} is already ${trip.status.toLowerCase()}`);
  }

  trip.status = 'CANCELLED';
  trip.cancelledReason = reason;
  trip.statusHistory.push({ status: 'CANCELLED', at: new Date(), by: actor._id, note: reason });
  await trip.save();
  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: 'TRIP_CANCELLED',
    summary: `${actor.name} cancelled trip ${trip.tripCode} — ${reason}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  await notify({
    users: [trip.driver],
    type: 'TRIP_CANCELLED',
    title: `Trip ${trip.tripCode} cancelled`,
    message: reason,
    link: `/trips/${trip._id}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  return trip.populate(TRIP_POPULATE);
}

export async function deleteTrip(id: string, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanChangeTrip(trip, actor);
  if (!['PLANNED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict('Only planned or cancelled trips can be deleted. Cancel the trip first.');
  }

  const [costs, expenses, fuel, documents] = await Promise.all([
    TransportationCost.exists({ trip: trip._id }),
    DriverExpense.exists({ trip: trip._id }),
    FuelRecord.exists({ trip: trip._id }),
    DocumentRecord.exists({ trip: trip._id }),
  ]);
  if (costs || expenses || fuel || documents) {
    throw ApiError.conflict('This trip has linked financial or compliance records. Keep it in history and cancel it instead of deleting it.');
  }

  await Promise.all([
    Cargo.updateMany({ trip: trip._id }, { trip: null, status: 'PENDING' }),
    Trip.deleteOne({ _id: trip._id }),
  ]);
  await releaseTruckIfUnused(trip.truck ? String(trip.truck) : null, String(trip._id));

  await recordAudit({
    ctx,
    action: 'TRIP_DELETED',
    summary: `${actor.name} deleted trip ${trip.tripCode}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  return { id };
}

/**
 * Recomputes the three cost buckets from their source collections.
 * Only APPROVED driver expenses count towards the trip's cost.
 */
export async function recalculateTripFinancials(tripId: string): Promise<void> {
  const _id = new Types.ObjectId(tripId);

  const [costs, expenses, fuel] = await Promise.all([
    TransportationCost.aggregate<{ total: number }>([
      { $match: { trip: _id } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    DriverExpense.aggregate<{ total: number }>([
      { $match: { trip: _id, status: 'APPROVED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FuelRecord.aggregate<{ total: number }>([
      { $match: { trip: _id } },
      { $group: { _id: null, total: { $sum: '$totalCost' } } },
    ]),
  ]);

  await Trip.updateOne(
    { _id },
    {
      transportationCost: round(costs[0]?.total ?? 0),
      driverExpenseTotal: round(expenses[0]?.total ?? 0),
      fuelCost: round(fuel[0]?.total ?? 0),
    },
  );
}

/** Keeps the truck and cargo statuses aligned with the trip status. */
async function syncSideEffectsForStatus(trip: TripDocument): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (trip.truck) {
    const unsafeBreakdown = await BreakdownReport.exists({
      truck: trip.truck,
      severity: { $in: ['HIGH', 'CRITICAL'] },
      status: { $nin: ['RESOLVED', 'CANCELLED'] },
    });
    const truckStatus = unsafeBreakdown ? 'MAINTENANCE' :
      trip.status === 'IN_TRANSIT' || trip.status === 'LOADING'
        ? 'IN_TRIP'
        : ['COMPLETED', 'CANCELLED', 'DELIVERED'].includes(trip.status)
          ? 'ASSIGNED'
          : 'ASSIGNED';

    tasks.push(
      Truck.updateOne(
        // A truck under maintenance keeps that status — it is the more urgent fact.
        { _id: trip.truck, status: { $nin: ['MAINTENANCE', 'INACTIVE', 'IN_TRIP'] } },
        { status: truckStatus },
      ),
    );

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      tasks.push(
        Truck.updateOne(
          { _id: trip.truck, status: { $nin: ['MAINTENANCE', 'INACTIVE'] }, assignedDriver: null },
          { status: 'AVAILABLE' },
        ),
      );
    }
  }

  if (trip.cargo?.length) {
    const cargoStatus =
      trip.status === 'IN_TRANSIT'
        ? 'IN_TRANSIT'
        : trip.status === 'LOADING'
          ? 'LOADED'
          : ['DELIVERED', 'COMPLETED'].includes(trip.status)
            ? 'DELIVERED'
            : 'ASSIGNED';

    if (trip.status === 'CANCELLED') {
      tasks.push(Cargo.updateMany({ _id: { $in: trip.cargo }, trip: trip._id }, { status: 'PENDING', trip: null }));
    } else {
      tasks.push(Cargo.updateMany({ _id: { $in: trip.cargo } }, { status: cargoStatus, trip: trip._id }));
    }
  }

  await Promise.all(tasks);
}

async function releaseTruckIfUnused(truckId: string | null, excludeTripId: string) {
  if (!truckId) return;
  const stillBusy = await Trip.countDocuments({
    truck: truckId,
    _id: { $ne: excludeTripId },
    status: { $in: ACTIVE_STATUSES },
  });
  if (stillBusy === 0) {
    const truck = await Truck.findById(truckId).select('assignedDriver status');
    if (truck && !['MAINTENANCE', 'INACTIVE'].includes(truck.status)) {
      truck.status = truck.assignedDriver ? 'ASSIGNED' : 'AVAILABLE';
      await truck.save();
    }
  }
}

function assertTransitionAllowed(trip: TripDocument, next: TripStatus) {
  const allowed = TRIP_TRANSITIONS[trip.status] ?? [];
  if (!allowed.includes(next)) {
    throw ApiError.conflict(
      `A trip in "${trip.status}" cannot move to "${next}". Allowed next steps: ${allowed.join(', ') || 'none'}.`,
    );
  }
}

function assertCanSeeTrip(trip: TripDocument, user: UserDocument) {
  if (user.role === 'DRIVER') {
    const driverId = refId(trip.driver);
    if (driverId !== String(user._id)) {
      throw ApiError.forbidden('This trip is not assigned to you');
    }
    return;
  }
  // Managers see their own and shared trips; administrators see everything.
  assertCanSee(trip, user, 'trip');
}

/** Changing a trip needs EDIT, which a VIEW-only sharee does not have. */
/**
 * Who held a truck on a given date, from its ownership history.
 *
 * Returns null when the history says nothing about that date — an empty
 * history, or a date before the truck was first assigned. Null means "we do not
 * know", never "nobody", so the caller leaves the figures where they are rather
 * than attributing them to a guess.
 */
export function ownerAt(
  history: { owner?: unknown; from: Date; to?: Date | null }[] | undefined,
  when: Date,
): unknown {
  for (const period of history ?? []) {
    const from = new Date(period.from).getTime();
    const to = period.to ? new Date(period.to).getTime() : Infinity;
    if (when.getTime() >= from && when.getTime() <= to) return period.owner ?? null;
  }
  return null;
}

function assertCanChangeTrip(trip: TripDocument, user: UserDocument) {
  if (user.role === 'DRIVER') {
    assertCanSeeTrip(trip, user);
    return;
  }
  assertCanEdit(trip, user, 'trip');
}

/**
 * `actor` is required rather than optional on purpose. An optional authorization
 * argument is one a future call site forgets to pass, and the check then fails
 * open with nothing to show for it.
 */
async function assertTruckUsable(
  truckId: string,
  start: Date,
  end: Date,
  excludeTripId: string | undefined,
  actor: UserDocument,
  settlingStaleTrip = false,
) {
  const truck = await Truck.findById(truckId);
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');
  // Running a trip on a truck is a change to that truck's week, so it needs
  // EDIT. The message matches "not found" on purpose: a manager must not be
  // able to tell another manager's truck from one that does not exist.
  if (!canAccess(truck, actor, 'EDIT')) {
    throw ApiError.badRequest('The selected truck could not be found');
  }
  if (['MAINTENANCE', 'INACTIVE'].includes(truck.status)) {
    throw ApiError.conflict(`Truck ${truck.truckNumber} is ${truck.status.toLowerCase()} and cannot be dispatched`);
  }
  const unsafeBreakdown = await BreakdownReport.exists({
    truck: truckId,
    severity: { $in: ['HIGH', 'CRITICAL'] },
    status: { $nin: ['RESOLVED', 'CANCELLED'] },
  });
  if (unsafeBreakdown) throw ApiError.conflict(`Truck ${truck.truckNumber} has an unresolved high-severity breakdown`);

  await assertResourceHasNoTripOverlap('truck', truckId, start, end, excludeTripId, truck.truckNumber);
  if (!settlingStaleTrip) await assertResourceHasNoStaleTrip('truck', truckId, excludeTripId, truck.truckNumber);
  await assertNoMaintenanceOverlap(truckId, start, end, truck.truckNumber);
  return truck;
}

/**
 * `expectedOwner` is the manager the trip will belong to — required, for the
 * same reason as above. `null` means the trip has no owner yet, which only an
 * administrator can bring about, so any driver is allowed in that case.
 */
async function assertDriverUsable(
  driverId: string,
  start: Date,
  end: Date,
  excludeTripId: string | undefined,
  expectedOwner: unknown,
  settlingStaleTrip = false,
) {
  const driver = await User.findOne({ _id: driverId, role: 'DRIVER' });
  if (!driver) throw ApiError.badRequest('The selected driver could not be found');
  if (driver.status !== 'ACTIVE') throw ApiError.badRequest('Only active drivers can be assigned to a trip');
  // A driver drives for one manager. Putting someone else's driver on this trip
  // would hand their working week to a manager who is not responsible for them.
  if (expectedOwner !== null && refId(driver.manager) !== refId(expectedOwner)) {
    throw ApiError.badRequest('The selected driver could not be found');
  }
  await assertResourceHasNoTripOverlap('driver', driverId, start, end, excludeTripId, driver.name);
  if (!settlingStaleTrip) await assertResourceHasNoStaleTrip('driver', driverId, excludeTripId, driver.name);
  return driver;
}

/** `Truck GJ33B1111` / `Driver Asha` — how a resource is named in an error. */
function resourceLabel(field: 'truck' | 'driver', label: string) {
  return `${field === 'truck' ? 'Truck' : 'Driver'} ${label}`;
}

/**
 * Does the requested window collide with a trip this resource is already
 * committed to? That question and nothing else — a trip that is merely
 * unsettled is a separate matter, asked by `assertResourceHasNoStaleTrip`.
 */
async function assertResourceHasNoTripOverlap(
  field: 'truck' | 'driver', id: string, start: Date, end: Date, excludeTripId: string | undefined, label: string,
) {
  const conflict = await Trip.findOne({
    [field]: id,
    status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED'] },
    startDate: { $lte: end },
    $expr: { $gte: [{ $ifNull: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, start] },
    ...(excludeTripId ? { _id: { $ne: excludeTripId } } : {}),
  }).select('_id tripCode');
  if (conflict) {
    throw ApiError.conflict(
      `${resourceLabel(field, label)} is already booked for ${conflict.tripCode} during this window`,
    );
  }
}

/**
 * A gate, not an overlap check. A trip that is overdue on the road, or that was
 * due to leave on a past date and never did, leaves the resource unaccounted
 * for: nobody can say where it is or when it comes free. Booking over it turns
 * into a real double-booking the moment someone picks that trip back up, so the
 * stale trip has to be settled first — rescheduled, closed or cancelled.
 *
 * It ignores the requested window on purpose, because the window is not the
 * problem. Folding this into the overlap query above is what used to make the
 * system report a clash between two trips whose dates never touched, and leave
 * the dispatcher with no way to tell which trip to go and fix.
 */
async function assertResourceHasNoStaleTrip(
  field: 'truck' | 'driver', id: string, excludeTripId: string | undefined, label: string,
) {
  const stale = await Trip.findOne({
    [field]: id,
    ...staleTripFilter(),
    ...(excludeTripId ? { _id: { $ne: excludeTripId } } : {}),
  }).select('tripCode status startDate expectedDeliveryDate');
  if (!stale) return;

  throw ApiError.conflict(
    stale.status === 'IN_TRANSIT'
      ? `${resourceLabel(field, label)} is still out on ${stale.tripCode}, which was due back on ${indiaDayLabel(stale.expectedDeliveryDate)}. Close that trip before booking a new one.`
      : `${resourceLabel(field, label)} is still held by ${stale.tripCode}, which was due to start on ${indiaDayLabel(stale.startDate)} and never left. Reschedule, complete or cancel it first.`,
  );
}

async function assertHistoricalResourceAvailable(field: 'truck' | 'driver', id: string, start: Date, end: Date, label: string) {
  const conflict = await Trip.findOne({
    [field]: id,
    status: { $ne: 'CANCELLED' },
    startDate: { $lte: end },
    $expr: { $gte: [{ $ifNull: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, start] },
  }).select('tripCode');
  if (conflict) {
    throw ApiError.conflict(`${field === 'truck' ? 'Truck' : 'Driver'} ${label} already has a trip in this historical window (${conflict.tripCode})`);
  }
}

async function assertNoMaintenanceOverlap(truckId: string, start: Date, end: Date, truckNumber: string) {
  const startDay = new Date(start);
  startDay.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setUTCHours(23, 59, 59, 999);
  const conflict = await Maintenance.findOne({
    truck: truckId,
    status: { $in: ['SCHEDULED', 'IN_PROGRESS'] },
    $or: [
      { status: 'IN_PROGRESS' },
      { date: { $gte: startDay, $lte: endDay } },
    ],
  }).select('_id');
  if (conflict) throw ApiError.conflict(`Truck ${truckNumber} has maintenance scheduled during this trip window`);
}

async function recordTripOdometer(
  trip: TripDocument, event: 'START' | 'CLOSE', reading: number, actorId: Types.ObjectId,
) {
  const prior = trip.odometerReadings.find((item) => item.event === event);
  if (prior) throw ApiError.conflict(`The ${event === 'START' ? 'starting' : 'closing'} odometer reading is already recorded`);
  const startingReading = trip.odometerReadings.find((item) => item.event === 'START')?.valueKm;
  if (event === 'CLOSE' && startingReading === undefined) {
    throw ApiError.conflict('A starting odometer reading must be recorded before closing the trip');
  }
  if (event === 'CLOSE' && startingReading! > reading) {
    throw ApiError.validation('Closing odometer must be at least the starting odometer');
  }
  const truck = trip.truck ? await Truck.findById(trip.truck).select('odometerKm') : null;
  if (!truck) throw ApiError.conflict('The trip must have a truck before recording odometer readings');
  if (reading < truck.odometerKm) {
    throw ApiError.validation(`Odometer reading cannot be below the truck's latest verified reading (${truck.odometerKm} km)`);
  }
  await advanceTruckOdometer(String(truck._id), reading);
  trip.odometerReadings.push({ event, valueKm: reading, recordedAt: new Date(), recordedBy: actorId });
}

function indiaDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

async function assertCargoAvailable(cargoIds: string[], excludeTripId?: string) {
  if (cargoIds.length === 0) return;
  const items = await Cargo.find({ _id: { $in: cargoIds } }).select('cargoCode trip status');
  if (items.length !== cargoIds.length) throw ApiError.badRequest('One or more cargo items could not be found');

  const taken = items.filter(
    (item) => (item.trip && String(item.trip) !== excludeTripId) || (!item.trip && item.status !== 'PENDING'),
  );
  if (taken.length > 0) {
    throw ApiError.conflict(
      `Cargo ${taken.map((item) => item.cargoCode).join(', ')} is already assigned to another trip`,
    );
  }
}

async function notifyDriverOfAssignment(trip: TripDocument) {
  if (!trip.driver) return;
  await notify({
    users: [trip.driver],
    type: 'TRIP_ASSIGNED',
    title: `New trip assigned — ${trip.tripCode}`,
    message: `${trip.pickupLocation} → ${trip.deliveryLocation}, starting ${trip.startDate.toDateString()}.`,
    link: `/trips/${trip._id}`,
    entity: 'Trip',
    entityId: trip._id,
  });
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}


