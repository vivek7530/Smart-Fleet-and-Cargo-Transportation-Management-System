import type { Ctx } from '../../api/context';
import { Types } from 'mongoose';
import { Trip, type TripDocument } from '../../models/Trip';
import { Truck } from '../../models/Truck';
import { Cargo } from '../../models/Cargo';
import { User, type UserDocument } from '../../models/User';
import { DriverExpense } from '../../models/DriverExpense';
import { TransportationCost } from '../../models/TransportationCost';
import { FuelRecord } from '../../models/FuelRecord';
import { DocumentRecord } from '../../models/DocumentRecord';
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
import { notify, usersWithRoles } from '../../services/notification.service';
import { TRIP_TRANSITIONS, type TripStatus } from '../../types/enums';

const SEARCH_FIELDS = ['tripCode', 'pickupLocation', 'deliveryLocation', 'notes'];
const SORT_FIELDS = ['createdAt', 'tripCode', 'startDate', 'expectedDeliveryDate', 'status', 'revenue'];
const ACTIVE_STATUSES: TripStatus[] = ['ASSIGNED', 'LOADING', 'IN_TRANSIT'];

const TRIP_POPULATE = [
  { path: 'truck', select: 'truckNumber registrationNumber make model status capacityTons' },
  { path: 'driver', select: 'name mobile email avatarColor licenseNumber' },
  { path: 'cargo', select: 'cargoCode description weightTons type status origin destination' },
];

type TripListQuery = ListQuery & {
  status?: string;
  driver?: string;
  truck?: string;
  active?: boolean;
};

/** Drivers can only ever see the trips assigned to them — enforced here, not in the UI. */
export function tripScopeFor(user: UserDocument) {
  return user.role === 'DRIVER' ? { driver: user._id } : {};
}

export async function listTrips(query: TripListQuery, user: UserDocument) {
  const { sortBy, sortDir } = resolveSort(query, SORT_FIELDS, 'startDate');

  const filter = mergeFilters(
    tripScopeFor(user),
    query.status ? { status: query.status } : null,
    query.active ? { status: { $in: ACTIVE_STATUSES } } : null,
    query.driver && user.role !== 'DRIVER' ? { driver: query.driver } : null,
    query.truck ? { truck: query.truck } : null,
    searchFilter(query.search, SEARCH_FIELDS),
    dateRangeFilter('startDate', query.from, query.to),
  );

  return paginate(Trip, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: TRIP_POPULATE,
  });
}

export async function getTrip(id: string, user: UserDocument) {
  const trip = await Trip.findById(id).populate(TRIP_POPULATE).populate('createdBy', 'name role');
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanSeeTrip(trip, user);

  const [expenses, costs, fuel, documents] = await Promise.all([
    DriverExpense.find({ trip: trip._id }).sort({ date: -1 }).populate('driver', 'name avatarColor'),
    TransportationCost.find({ trip: trip._id }).sort({ date: -1 }),
    FuelRecord.find({ trip: trip._id }).sort({ date: -1 }),
    DocumentRecord.find({ trip: trip._id }).sort({ createdAt: -1 }),
  ]);

  return {
    trip: trip.toJSON(),
    expenses: expenses.map((e) => e.toJSON()),
    transportationCosts: costs.map((c) => c.toJSON()),
    fuelRecords: fuel.map((f) => f.toJSON()),
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

  if (body.truck) await assertTruckUsable(body.truck);
  if (body.driver) await assertDriverUsable(body.driver);
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

export async function updateTrip(id: string, input: Record<string, unknown>, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict(`Trip ${trip.tripCode} is ${trip.status.toLowerCase()} and can no longer be edited`);
  }

  const previousDriver = trip.driver ? String(trip.driver) : null;
  const previousTruck = trip.truck ? String(trip.truck) : null;

  if (input.truck && input.truck !== previousTruck) await assertTruckUsable(input.truck as string, String(trip._id));
  if (input.driver && input.driver !== previousDriver) await assertDriverUsable(input.driver as string);

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
  assertCanSeeTrip(trip, actor);

  // Drivers drive the operational part of the lifecycle but never close the books.
  if (actor.role === 'DRIVER' && !['LOADING', 'IN_TRANSIT', 'DELIVERED'].includes(nextStatus)) {
    throw ApiError.forbidden('Drivers can only update a trip up to delivery');
  }

  assertTransitionAllowed(trip, nextStatus);

  trip.status = nextStatus;
  trip.statusHistory.push({ status: nextStatus, at: new Date(), by: actor._id, note });

  if (nextStatus === 'IN_TRANSIT' && !trip.startedAt) trip.startedAt = new Date();
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

export async function startTrip(id: string, body: { note?: string; odometerKm?: number }, ctx: Ctx) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');
  assertCanSeeTrip(trip, actor);

  if (!trip.truck || !trip.driver) {
    throw ApiError.conflict('Assign a truck and a driver before starting this trip');
  }
  if (trip.status === 'IN_TRANSIT') throw ApiError.conflict('This trip has already started');
  if (!['ASSIGNED', 'LOADING'].includes(trip.status)) {
    throw ApiError.conflict(`A trip in "${trip.status}" cannot be started`);
  }

  trip.status = 'IN_TRANSIT';
  trip.startedAt = new Date();
  trip.statusHistory.push({
    status: 'IN_TRANSIT',
    at: trip.startedAt,
    by: actor._id,
    note: body.note ?? 'Trip started',
  });
  await trip.save();

  if (body.odometerKm != null) {
    await Truck.updateOne({ _id: trip.truck }, { odometerKm: body.odometerKm });
  }
  await syncSideEffectsForStatus(trip);

  await recordAudit({
    ctx,
    action: 'TRIP_STARTED',
    summary: `${actor.name} started trip ${trip.tripCode}`,
    entity: 'Trip',
    entityId: trip._id,
  });

  await notify({
    users: await usersWithRoles('ADMIN', 'MANAGER'),
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
  body: { actualDeliveryDate?: string; note?: string; odometerKm?: number },
  ctx: Ctx,
) {
  const actor = ctx.user;
  const trip = await Trip.findById(id);
  if (!trip) throw ApiError.notFound('That trip could not be found');

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

  trip.status = 'COMPLETED';
  trip.completedAt = new Date();
  trip.actualDeliveryDate = body.actualDeliveryDate
    ? new Date(body.actualDeliveryDate)
    : (trip.actualDeliveryDate ?? new Date());
  trip.statusHistory.push({
    status: 'COMPLETED',
    at: trip.completedAt,
    by: actor._id,
    note: body.note ?? 'Trip completed',
  });

  await trip.save();
  await recalculateTripFinancials(String(trip._id));
  if (body.odometerKm != null && trip.truck) {
    await Truck.updateOne({ _id: trip.truck }, { odometerKm: body.odometerKm });
  }
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
    users: [trip.driver, ...(await usersWithRoles('ADMIN', 'MANAGER'))],
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
  if (!['PLANNED', 'CANCELLED'].includes(trip.status)) {
    throw ApiError.conflict('Only planned or cancelled trips can be deleted. Cancel the trip first.');
  }

  await Promise.all([
    Cargo.updateMany({ trip: trip._id }, { trip: null, status: 'PENDING' }),
    TransportationCost.deleteMany({ trip: trip._id }),
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
    const truckStatus =
      trip.status === 'IN_TRANSIT' || trip.status === 'LOADING'
        ? 'IN_TRIP'
        : ['COMPLETED', 'CANCELLED', 'DELIVERED'].includes(trip.status)
          ? 'ASSIGNED'
          : 'ASSIGNED';

    tasks.push(
      Truck.updateOne(
        // A truck under maintenance keeps that status — it is the more urgent fact.
        { _id: trip.truck, status: { $ne: 'MAINTENANCE' } },
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
            : trip.status === 'CANCELLED'
              ? 'CANCELLED'
              : 'ASSIGNED';

    tasks.push(Cargo.updateMany({ _id: { $in: trip.cargo } }, { status: cargoStatus, trip: trip._id }));
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
  if (user.role !== 'DRIVER') return;
  const driverId = trip.driver && typeof trip.driver === 'object' && '_id' in trip.driver
    ? String((trip.driver as { _id: Types.ObjectId })._id)
    : String(trip.driver);
  if (driverId !== String(user._id)) {
    throw ApiError.forbidden('This trip is not assigned to you');
  }
}

async function assertTruckUsable(truckId: string, excludeTripId?: string) {
  const truck = await Truck.findById(truckId);
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');
  if (['MAINTENANCE', 'INACTIVE'].includes(truck.status)) {
    throw ApiError.conflict(`Truck ${truck.truckNumber} is ${truck.status.toLowerCase()} and cannot be dispatched`);
  }

  const conflicting = await Trip.countDocuments({
    truck: truckId,
    status: { $in: ACTIVE_STATUSES },
    ...(excludeTripId ? { _id: { $ne: excludeTripId } } : {}),
  });
  if (conflicting > 0) {
    throw ApiError.conflict(`Truck ${truck.truckNumber} is already on an active trip`);
  }
  return truck;
}

async function assertDriverUsable(driverId: string) {
  const driver = await User.findOne({ _id: driverId, role: 'DRIVER' });
  if (!driver) throw ApiError.badRequest('The selected driver could not be found');
  if (driver.status !== 'ACTIVE') throw ApiError.badRequest('Only active drivers can be assigned to a trip');
  return driver;
}

async function assertCargoAvailable(cargoIds: string[], excludeTripId?: string) {
  if (cargoIds.length === 0) return;
  const items = await Cargo.find({ _id: { $in: cargoIds } }).select('cargoCode trip status');
  if (items.length !== cargoIds.length) throw ApiError.badRequest('One or more cargo items could not be found');

  const taken = items.filter(
    (item) => item.trip && String(item.trip) !== excludeTripId,
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


