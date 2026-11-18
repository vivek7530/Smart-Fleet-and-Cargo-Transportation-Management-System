import type { Ctx } from '../../api/context';
import { Types } from 'mongoose';
import { Truck, type TruckDocument } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { User } from '../../models/User';
import { Maintenance } from '../../models/Maintenance';
import { FuelRecord } from '../../models/FuelRecord';
import { DocumentRecord } from '../../models/DocumentRecord';
import { BreakdownReport } from '../../models/BreakdownReport';
import { ApiError } from '../../lib/ApiError';
import {
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
  type ListQuery,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import {
  assertCanEdit,
  assertCanSee,
  canSeeFinancials,
  isAdmin,
  ownerScopeFor,
  redactTripFor,
  redactTruckFor,
  refId,
  omitFields,
  type ActorLike,
  type OwnedLike,
} from '../../lib/ownership';
import type { SharePermission, TruckStatus } from '../../types/enums';
import type { CreateTruckInput, UpdateTruckInput } from './trucks.validation';

const SEARCH_FIELDS = ['truckNumber', 'registrationNumber', 'make', 'model', 'insuranceProvider'];
const SORT_FIELDS = ['createdAt', 'truckNumber', 'year', 'capacityTons', 'status', 'odometerKm'];

type TruckListQuery = ListQuery & {
  status?: string;
  fuelType?: string;
  assignedDriver?: string;
  unassigned?: boolean;
  owner?: string;
  unowned?: boolean;
};

const TRUCK_OWNER_POPULATE = [
  { path: 'assignedDriver', select: 'name mobile email avatarColor' },
  { path: 'owner', select: 'name avatarColor role' },
];

export async function listTrucks(query: TruckListQuery, user: ActorLike) {
  const { sortBy, sortDir } = resolveSort(query, SORT_FIELDS);

  const filter = mergeFilters(
    // Leads the filter so the { owner, status, createdAt } index is used.
    ownerScopeFor(user),
    query.status ? { status: query.status } : null,
    query.fuelType ? { fuelType: query.fuelType } : null,
    query.assignedDriver ? { assignedDriver: query.assignedDriver } : null,
    query.unassigned ? { assignedDriver: null } : null,
    // Filtering by owner is an administrative view of the whole fleet. For a
    // manager the scope above already decides what they see, so letting them
    // pass an owner could only ever narrow it — never widen it — but it would
    // also confirm which manager ids exist, so it is ignored outright.
    isAdmin(user) && query.owner ? { owner: query.owner } : null,
    isAdmin(user) && query.unowned ? { owner: null } : null,
    searchFilter(query.search, SEARCH_FIELDS),
  );

  const page = await paginate(Truck, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: TRUCK_OWNER_POPULATE,
  });

  return {
    ...page,
    items: page.items.map((item) => redactTruckFor(item, item as OwnedLike, user)),
  };
}

export async function getTruck(id: string, user: ActorLike) {
  const truck = await Truck.findById(id)
    .populate('assignedDriver', 'name mobile email avatarColor licenseNumber')
    .populate('owner', 'name avatarColor role')
    .populate('sharedWith.user', 'name avatarColor role')
    .populate('ownerHistory.owner', 'name avatarColor role');
  if (!truck) throw ApiError.notFound('That truck could not be found');
  assertCanSee(truck, user, 'truck');

  const [recentTrips, recentMaintenance, recentFuel, documents, totals] = await Promise.all([
    Trip.find({ truck: truck._id }).sort({ createdAt: -1 }).limit(5).populate('driver', 'name'),
    Maintenance.find({ truck: truck._id }).sort({ date: -1 }).limit(5),
    FuelRecord.find({ truck: truck._id }).sort({ date: -1 }).limit(5),
    DocumentRecord.find({ truck: truck._id }).sort({ createdAt: -1 }).limit(10),
    truckTotals(String(truck._id), user, truck),
  ]);

  return {
    truck: redactTruckFor(truck.toJSON(), truck, user),
    // Each trip carries its own answer: a trip inherited from a previous owner
    // keeps its figures hidden even on a truck this manager fully owns.
    recentTrips: recentTrips.map((trip) => redactTripFor(trip.toJSON(), trip, user)),
    recentMaintenance: recentMaintenance.map((m) => m.toJSON()),
    recentFuel: recentFuel.map((f) => f.toJSON()),
    documents: documents.map((d) => d.toJSON()),
    totals,
  };
}

async function truckTotals(truckId: string, user: ActorLike, truck: OwnedLike) {
  const truckObjectId = new Types.ObjectId(truckId);

  // A manager's totals leave out trips inherited from a previous owner: that
  // revenue is not theirs, and rolling it in would overstate their performance.
  // The administrator sees the truck's complete lifetime figures.
  const revenueMatch = isAdmin(user)
    ? { truck: truckObjectId }
    : { truck: truckObjectId, inheritedFrom: null };

  const [trips, maintenance, fuel] = await Promise.all([
    Trip.aggregate<{ _id: null; count: number; revenue: number }>([
      { $match: revenueMatch },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$revenue', 0] } } } },
    ]),
    Maintenance.aggregate<{ _id: null; cost: number; count: number }>([
      { $match: { truck: truckObjectId } },
      { $group: { _id: null, cost: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$cost', 0] } }, count: { $sum: 1 } } },
    ]),
    FuelRecord.aggregate<{ _id: null; cost: number; litres: number }>([
      { $match: { truck: truckObjectId } },
      { $group: { _id: null, cost: { $sum: '$totalCost' }, litres: { $sum: '$litres' } } },
    ]),
  ]);

  const totals = {
    totalTrips: trips[0]?.count ?? 0,
    totalRevenue: trips[0]?.revenue ?? 0,
    maintenanceCost: maintenance[0]?.cost ?? 0,
    maintenanceCount: maintenance[0]?.count ?? 0,
    fuelCost: fuel[0]?.cost ?? 0,
    fuelLitres: Math.round((fuel[0]?.litres ?? 0) * 100) / 100,
  };

  // A VIEW sharee is here to help run the truck, not to read its economics.
  // Trip and litre counts are operational, so they stay.
  if (canSeeFinancials(truck, user)) return totals;
  return omitFields(totals, ['totalRevenue', 'maintenanceCost', 'fuelCost']);
}

export async function createTruck(input: CreateTruckInput, ctx: Ctx) {
  const actor = ctx.user;

  // A manager always creates a truck for themselves — the body is never trusted
  // to say otherwise, or one manager could file a truck under another. An
  // administrator chooses, and may deliberately leave it unowned, which puts it
  // on the red-flag list rather than quietly attaching it to whoever typed it in.
  const { owner: requestedOwner, ...rest } = input;
  const owner = isAdmin(actor) ? (requestedOwner ?? null) : actor._id;
  if (owner && isAdmin(actor)) await assertOwnerIsManager(String(owner));

  if (input.assignedDriver) await assertDriverAssignable(input.assignedDriver, owner);

  const truck = await Truck.create({
    ...rest,
    // One number is entered and both are expected to match.
    registrationNumber: input.registrationNumber ?? input.truckNumber,
    status: input.assignedDriver ? 'ASSIGNED' : input.status,
    owner,
    ownerHistory: owner ? [{ owner, from: new Date(), to: null }] : [],
    createdBy: actor._id,
  });

  if (input.assignedDriver) await detachDriverFromOtherTrucks(input.assignedDriver, String(truck._id), owner, ctx);

  await recordAudit({
    ctx,
    action: 'TRUCK_CREATED',
    summary: `${actor.name} added truck ${truck.truckNumber}`,
    entity: 'Truck',
    entityId: truck._id,
    metadata: { registrationNumber: truck.registrationNumber, initialOdometerKm: truck.odometerKm },
  });

  return truck;
}

export async function updateTruck(id: string, input: UpdateTruckInput, ctx: Ctx) {
  const actor = ctx.user;
  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');
  assertCanEdit(truck, actor, 'truck');

  // Handing a truck to a different manager is a transfer, not an edit: it has to
  // carry the trips and the driver with it, so it belongs to the ownership
  // service and to an administrator. Silently ignoring the field here would hide
  // a failed intent, so say so.
  if (input.owner !== undefined && refId(input.owner) !== refId(truck.owner)) {
    throw ApiError.forbidden('Use the transfer action to move a truck to another manager');
  }

  if (input.assignedDriver && input.assignedDriver !== String(truck.assignedDriver)) {
    await assertDriverAssignable(input.assignedDriver, truck.owner);
  }

  if (input.assignedDriver !== undefined && input.assignedDriver !== String(truck.assignedDriver ?? '') && truck.status === 'IN_TRIP') {
    throw ApiError.conflict('The assigned driver cannot be changed while this truck is on a trip');
  }
  if (input.assignedDriver !== undefined && input.assignedDriver !== String(truck.assignedDriver ?? '')) {
    const tripInProgress = await Trip.exists({ truck: truck._id, status: { $in: ['LOADING', 'IN_TRANSIT'] } });
    if (tripInProgress) throw ApiError.conflict('The assigned driver cannot be changed while this truck has a trip in progress');
  }

  // A truck in transit must not be quietly retired underneath a live trip.
  if (input.status && input.status !== truck.status && truck.status === 'IN_TRIP') {
    const activeTrips = await Trip.countDocuments({
      truck: truck._id,
      status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
    });
    if (activeTrips > 0 && input.status !== 'IN_TRIP') {
      throw ApiError.conflict('This truck is on an active trip. Complete or cancel the trip first.');
    }
  }

  // The form no longer asks for the registration, so keep it in step with the
  // truck number for every record where the two were already the same. A truck
  // whose plate genuinely differs keeps its own value.
  const mirrored = truck.registrationNumber === truck.truckNumber;

  Object.assign(truck, sanitiseTruckPatch(input));

  if (input.registrationNumber === undefined && mirrored && input.truckNumber) {
    truck.registrationNumber = truck.truckNumber;
  }
  if (input.assignedDriver !== undefined) {
    truck.assignedDriver = input.assignedDriver ? (input.assignedDriver as unknown as TruckDocument['assignedDriver']) : null;
    if (!input.status) {
      truck.status = input.assignedDriver ? 'ASSIGNED' : truck.status === 'ASSIGNED' ? 'AVAILABLE' : truck.status;
    }
  }

  await truck.save();
  if (input.assignedDriver) await detachDriverFromOtherTrucks(input.assignedDriver, String(truck._id), truck.owner, ctx);

  await recordAudit({
    ctx,
    action: 'TRUCK_UPDATED',
    summary: `${actor.name} updated truck ${truck.truckNumber}`,
    entity: 'Truck',
    entityId: truck._id,
  });

  return truck;
}

export async function assignDriver(id: string, driverId: string | null, ctx: Ctx) {
  const actor = ctx.user;
  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');
  assertCanEdit(truck, actor, 'truck');

  if (driverId !== String(truck.assignedDriver ?? '') && truck.status === 'IN_TRIP') {
    throw ApiError.conflict('The assigned driver cannot be changed while this truck is on a trip');
  }
  if (driverId !== String(truck.assignedDriver ?? '')) {
    const tripInProgress = await Trip.exists({ truck: truck._id, status: { $in: ['LOADING', 'IN_TRANSIT'] } });
    if (tripInProgress) throw ApiError.conflict('The assigned driver cannot be changed while this truck has a trip in progress');
  }

  if (driverId) {
    const driver = await assertDriverAssignable(driverId, truck.owner);
    truck.assignedDriver = driver._id;
    if (truck.status === 'AVAILABLE') truck.status = 'ASSIGNED';
    await truck.save();
    await detachDriverFromOtherTrucks(driverId, String(truck._id), truck.owner, ctx);

    await notify({
      users: [driver._id],
      type: 'GENERAL',
      title: 'Truck assigned',
      message: `You have been assigned truck ${truck.truckNumber} (${truck.make} ${truck.model}).`,
      link: '/my-truck',
      entity: 'Truck',
      entityId: truck._id,
    });

    await recordAudit({
      ctx,
      action: 'TRUCK_DRIVER_ASSIGNED',
      summary: `${actor.name} assigned truck ${truck.truckNumber} to ${driver.name}`,
      entity: 'Truck',
      entityId: truck._id,
      metadata: { driverId: String(driver._id) },
    });
  } else {
    truck.assignedDriver = null;
    if (truck.status === 'ASSIGNED') truck.status = 'AVAILABLE';
    await truck.save();

    await recordAudit({
      ctx,
      action: 'TRUCK_DRIVER_UNASSIGNED',
      summary: `${actor.name} unassigned the driver from truck ${truck.truckNumber}`,
      entity: 'Truck',
      entityId: truck._id,
    });
  }

  return truck.populate('assignedDriver', 'name mobile email avatarColor');
}

export async function deleteTruck(id: string, ctx: Ctx) {
  const actor = ctx.user;
  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');
  assertCanEdit(truck, actor, 'truck');

  const activeTrips = await Trip.countDocuments({
    truck: truck._id,
    status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
  });
  if (activeTrips > 0) {
    throw ApiError.conflict(
      `Truck ${truck.truckNumber} is used by ${activeTrips} open trip${activeTrips > 1 ? 's' : ''}. Close them first.`,
    );
  }

  const [tripHistory, maintenanceHistory, fuelHistory, documentHistory, breakdownHistory] = await Promise.all([
    Trip.exists({ truck: truck._id }),
    Maintenance.exists({ truck: truck._id }),
    FuelRecord.exists({ truck: truck._id }),
    DocumentRecord.exists({ truck: truck._id }),
    BreakdownReport.exists({ truck: truck._id }),
  ]);
  if (tripHistory || maintenanceHistory || fuelHistory || documentHistory || breakdownHistory) {
    throw ApiError.conflict(`Truck ${truck.truckNumber} has operational history. Mark it inactive instead of deleting it.`);
  }

  await Truck.deleteOne({ _id: truck._id });

  await recordAudit({
    ctx,
    action: 'TRUCK_DELETED',
    summary: `${actor.name} deleted truck ${truck.truckNumber}`,
    entity: 'Truck',
    entityId: truck._id,
  });

  return { id };
}

/** The truck a driver is currently responsible for. */
export async function getAssignedTruckFor(driverId: string) {
  const truck = await Truck.findOne({ assignedDriver: driverId }).populate(
    'assignedDriver',
    'name mobile email avatarColor',
  );
  if (!truck) return null;

  const [documents, recentMaintenance, activeTrip] = await Promise.all([
    DocumentRecord.find({ truck: truck._id }).sort({ expiryDate: 1 }).limit(10),
    Maintenance.find({ truck: truck._id }).sort({ date: -1 }).limit(5),
    Trip.findOne({ truck: truck._id, status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } }),
  ]);

  return {
    truck: truck.toJSON(),
    documents: documents.map((d) => d.toJSON()),
    recentMaintenance: recentMaintenance.map((m) => m.toJSON()),
    activeTrip: activeTrip?.toJSON() ?? null,
  };
}

/** An owner must be a manager who can actually take responsibility today. */
async function assertOwnerIsManager(ownerId: string) {
  const manager = await User.findOne({ _id: ownerId, role: 'MANAGER' }).select('status name');
  if (!manager) throw ApiError.badRequest('The selected owner is not a manager');
  if (manager.status !== 'ACTIVE') throw ApiError.badRequest('Only an active manager can own a truck');
  return manager;
}

/**
 * A driver can only be put on a truck belonging to the manager they work under.
 *
 * The message never names the other manager: a manager who can tell "this
 * driver works for someone else" from "no such driver" can map the roster by
 * guessing identifiers.
 */
async function assertDriverAssignable(driverId: string, truckOwner: unknown) {
  const driver = await User.findOne({ _id: driverId, role: 'DRIVER' });
  if (!driver) throw ApiError.badRequest('The selected driver could not be found');
  if (driver.status !== 'ACTIVE') throw ApiError.badRequest('Only active drivers can be assigned to a truck');

  const owner = refId(truckOwner);
  if (owner === null) {
    throw ApiError.badRequest('Assign this truck to a manager before giving it a driver');
  }
  if (refId(driver.manager) !== owner) {
    throw ApiError.badRequest('The selected driver could not be found');
  }
  return driver;
}

/**
 * A driver may hold only one truck at a time.
 *
 * This reaches across managers on purpose. Scoping it to the new truck's owner
 * left a driver still attached to a truck from a manager they had since moved
 * away from, and `getAssignedTruckFor` then had two rows to choose between and
 * showed whichever one Mongo handed back first — so a driver could open "My
 * truck" and be shown a vehicle they no longer drive.
 *
 * Stripping another manager's truck with nothing to explain it was the original
 * worry, and it stands, so every detachment that reaches outside the new
 * truck's owner is written to that truck's audit trail.
 */
async function detachDriverFromOtherTrucks(
  driverId: string, keepTruckId: string, keepOwner: unknown, ctx: Ctx,
) {
  const others = await Truck.find({
    assignedDriver: driverId,
    _id: { $ne: keepTruckId },
  }).select('truckNumber owner status');

  for (const other of others) {
    other.assignedDriver = null;
    // Only a truck that was merely spoken for falls back to available. One in
    // the workshop or out on the road keeps the status it has.
    if (other.status === 'ASSIGNED') other.status = 'AVAILABLE';
    await other.save();

    if (refId(other.owner) !== refId(keepOwner)) {
      await recordAudit({
        ctx,
        action: 'TRUCK_DRIVER_UNASSIGNED',
        summary: `Truck ${other.truckNumber} lost its driver, who was assigned to another manager's truck`,
        entity: 'Truck',
        entityId: other._id,
        metadata: { driverId: String(driverId) },
      });
    }
  }
}

function sanitiseTruckPatch(input: UpdateTruckInput) {
  const { assignedDriver, ...rest } = input;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    patch[key] = isDateField(key) && value ? new Date(value as string) : value;
  }
  return patch;
}

function isDateField(key: string) {
  return /Expiry$|Date$/.test(key);
}



/* ------------------------------------------------------------------------- *
 * The administrator's manager-by-manager view of the fleet.
 * ------------------------------------------------------------------------- */

/** One truck as it appears inside a manager's group — the list columns, no more. */
export interface ManagerFleetTruck {
  id: string;
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  status: TruckStatus;
  assignedDriver: { id: string; name: string; avatarColor?: string } | null;
  /** How many other managers this truck was shared with. */
  shareCount: number;
  createdAt: Date;
}

/** One driver as they appear inside a manager's group. */
export interface ManagerFleetDriver {
  id: string;
  name: string;
  mobile?: string | null;
  email?: string | null;
  avatarColor?: string;
  status: string;
  licenseNumber?: string | null;
  licenseExpiry?: Date | null;
  assignedTruck: { id: string; truckNumber: string } | null;
  activeTripCount: number;
}

export interface ManagerFleetGroup {
  manager: {
    id: string;
    name: string;
    email?: string | null;
    mobile?: string | null;
    avatarColor?: string;
    status: string;
  };
  truckCount: number;
  /** Only the statuses actually present, so the UI renders no empty chips. */
  byStatus: Record<string, number>;
  /** Trucks another manager owns that were shared with this one. */
  sharedInCount: number;
  trucks: ManagerFleetTruck[];
  driverCount: number;
  /** Only the statuses actually present, so the UI renders no empty chips. */
  driversByStatus: Record<string, number>;
  drivers: ManagerFleetDriver[];
}

export interface ManagerFleetReport {
  groups: ManagerFleetGroup[];
  /** Trucks nobody holds — the red flag an administrator has to resolve. */
  unassigned: ManagerFleetTruck[];
  /** Drivers nobody manages — the same red flag, on the people side. */
  unassignedDrivers: ManagerFleetDriver[];
  totals: {
    managers: number;
    trucks: number;
    assigned: number;
    unassigned: number;
    drivers: number;
    assignedDrivers: number;
    unassignedDrivers: number;
  };
}

type LeanFleetTruck = {
  _id: Types.ObjectId;
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  status: TruckStatus;
  owner?: Types.ObjectId | null;
  assignedDriver?: { _id: Types.ObjectId; name: string; avatarColor?: string } | null;
  sharedWith?: { user: Types.ObjectId }[];
  createdAt: Date;
};

/**
 * Every manager with the trucks they hold, listed in full.
 *
 * Administrators only — a manager asking this question would be asking which
 * trucks *other* managers hold, which is exactly what per-manager ownership
 * exists to prevent. The route guards that; this function assumes it.
 *
 * Grouping happens in memory rather than through `$lookup` because both sides
 * are small (managers, and one fleet) and a single pass keeps the whole report
 * consistent: the counts and the rows below them come from the same read.
 */
export async function listFleetByManager(): Promise<ManagerFleetReport> {
  const [managers, trucks, drivers, busy] = await Promise.all([
    User.find({ role: 'MANAGER', status: { $ne: 'ARCHIVED' } })
      .select('name email mobile avatarColor status')
      .sort({ name: 1 })
      .lean(),
    Truck.find({})
      .select('truckNumber registrationNumber make model year capacityTons status owner assignedDriver sharedWith createdAt')
      .populate('assignedDriver', 'name avatarColor')
      .sort({ truckNumber: 1 })
      .lean<LeanFleetTruck[]>(),
    User.find({ role: 'DRIVER', status: { $ne: 'ARCHIVED' } })
      .select('name email mobile avatarColor status licenseNumber licenseExpiry manager')
      .sort({ name: 1 })
      .lean(),
    // One aggregate for every driver's live trip count, rather than a query each.
    Trip.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } } },
      { $group: { _id: '$driver', count: { $sum: 1 } } },
    ]),
  ]);

  const shape = (truck: LeanFleetTruck): ManagerFleetTruck => ({
    id: String(truck._id),
    truckNumber: truck.truckNumber,
    registrationNumber: truck.registrationNumber,
    make: truck.make,
    model: truck.model,
    year: truck.year,
    capacityTons: truck.capacityTons,
    status: truck.status,
    assignedDriver: truck.assignedDriver
      ? {
          id: String(truck.assignedDriver._id),
          name: truck.assignedDriver.name,
          avatarColor: truck.assignedDriver.avatarColor,
        }
      : null,
    shareCount: truck.sharedWith?.length ?? 0,
    createdAt: truck.createdAt,
  });

  const owned = new Map<string, ManagerFleetTruck[]>();
  const sharedIn = new Map<string, number>();
  const unassigned: ManagerFleetTruck[] = [];

  for (const truck of trucks) {
    const row = shape(truck);
    const ownerId = truck.owner ? String(truck.owner) : null;

    if (ownerId) {
      const bucket = owned.get(ownerId);
      if (bucket) bucket.push(row);
      else owned.set(ownerId, [row]);
    } else {
      unassigned.push(row);
    }

    for (const share of truck.sharedWith ?? []) {
      if (!share?.user) continue;
      const sharee = String(share.user);
      // A share back to the owner would double-count; ownership already covers it.
      if (sharee === ownerId) continue;
      sharedIn.set(sharee, (sharedIn.get(sharee) ?? 0) + 1);
    }
  }

  // Which truck each driver is behind the wheel of, from the fleet already read.
  const truckByDriver = new Map<string, { id: string; truckNumber: string }>();
  for (const truck of trucks) {
    if (truck.assignedDriver) {
      truckByDriver.set(String(truck.assignedDriver._id), {
        id: String(truck._id),
        truckNumber: truck.truckNumber,
      });
    }
  }

  const activeByDriver = new Map(busy.filter((row) => row._id).map((row) => [String(row._id), row.count]));

  const driversByManager = new Map<string, ManagerFleetDriver[]>();
  const unassignedDrivers: ManagerFleetDriver[] = [];

  for (const driver of drivers) {
    const id = String(driver._id);
    const row: ManagerFleetDriver = {
      id,
      name: driver.name,
      mobile: driver.mobile ?? null,
      email: driver.email ?? null,
      avatarColor: driver.avatarColor,
      status: driver.status,
      licenseNumber: driver.licenseNumber ?? null,
      licenseExpiry: driver.licenseExpiry ?? null,
      assignedTruck: truckByDriver.get(id) ?? null,
      activeTripCount: activeByDriver.get(id) ?? 0,
    };

    const managerId = driver.manager ? String(driver.manager) : null;
    if (!managerId) {
      unassignedDrivers.push(row);
      continue;
    }
    const bucket = driversByManager.get(managerId);
    if (bucket) bucket.push(row);
    else driversByManager.set(managerId, [row]);
  }

  const groups: ManagerFleetGroup[] = managers.map((manager) => {
    const id = String(manager._id);
    const list = owned.get(id) ?? [];
    const byStatus: Record<string, number> = {};
    for (const truck of list) byStatus[truck.status] = (byStatus[truck.status] ?? 0) + 1;

    const roster = driversByManager.get(id) ?? [];
    const driversByStatus: Record<string, number> = {};
    for (const driver of roster) {
      driversByStatus[driver.status] = (driversByStatus[driver.status] ?? 0) + 1;
    }

    return {
      manager: {
        id,
        name: manager.name,
        email: manager.email ?? null,
        mobile: manager.mobile ?? null,
        avatarColor: manager.avatarColor,
        status: manager.status,
      },
      truckCount: list.length,
      byStatus,
      sharedInCount: sharedIn.get(id) ?? 0,
      trucks: list,
      driverCount: roster.length,
      driversByStatus,
      drivers: roster,
    };
  });

  // Busiest managers first; an empty-handed manager still appears, at the end,
  // because "this manager holds nothing" is itself worth seeing.
  groups.sort((a, b) => b.truckCount - a.truckCount || a.manager.name.localeCompare(b.manager.name));

  return {
    groups,
    unassigned,
    unassignedDrivers,
    totals: {
      managers: groups.length,
      trucks: trucks.length,
      assigned: trucks.length - unassigned.length,
      unassigned: unassigned.length,
      drivers: drivers.length,
      assignedDrivers: drivers.length - unassignedDrivers.length,
      unassignedDrivers: unassignedDrivers.length,
    },
  };
}

/* -------------------------------------------------------------------------- *
 * Transfer
 * -------------------------------------------------------------------------- */

export interface TransferTruckResult {
  truck: TruckDocument;
  /** Trips moved onto the new manager — the ones not yet finished. */
  tripsMoved: number;
  /** Finished trips left attributed to the previous manager. */
  tripsInherited: number;
  /** The driver, if they could not come along. */
  driverDetached: boolean;
  /** The driver, if they were moved onto the new manager's roster too. */
  driverMoved: boolean;
}

/**
 * Hands a truck to a different manager.
 *
 * `updateTruck` has always refused to do this, pointing at "the transfer
 * action" — which did not exist, so until now a truck could only ever be given
 * an owner at the moment it was created. This is that action.
 *
 * A transfer is not a field edit. Four things move together, and getting any
 * one of them wrong leaves the fleet in a state nobody can explain:
 *
 *   - **Ownership history** gains a closing date on the old stretch and a new
 *     open one, so "who held this truck in March?" stays answerable.
 *   - **Unfinished trips** follow the truck. They are work still to be done,
 *     and the new manager is the one who has to do it.
 *   - **Finished trips** stay where they are and are stamped `inheritedFrom`,
 *     which hides their figures from the new owner. That money was earned
 *     under someone else; crediting it to whoever holds the truck today would
 *     corrupt every report that asks who earned what.
 *   - **The driver** belongs to the old manager's roster, not to the truck. By
 *     default they are detached — a truck that keeps a driver its new manager
 *     cannot see would be refused by every later edit. `moveDriver` instead
 *     transfers them too, which is usually what an administrator means when a
 *     whole operation changes hands.
 *
 * A truck in the middle of a journey is refused outright. Transferring under a
 * moving trip would hand the new manager a vehicle they cannot account for and
 * strip the old one of a trip they are still running.
 */
export async function transferTruck(
  id: string,
  input: { owner: string | null; moveDriver?: boolean },
  ctx: Ctx,
): Promise<TransferTruckResult> {
  const actor = ctx.user;
  if (!isAdmin(actor)) {
    throw ApiError.forbidden('Only an administrator can move a truck to another manager');
  }

  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');

  const previousOwner = truck.owner ?? null;
  if (refId(previousOwner) === refId(input.owner)) {
    throw ApiError.badRequest('This truck already belongs to that manager');
  }

  const nextOwner = input.owner ? (await assertOwnerIsManager(input.owner))._id : null;

  const inProgress = await Trip.exists({
    truck: truck._id,
    status: { $in: ['LOADING', 'IN_TRANSIT'] },
  });
  if (inProgress) {
    throw ApiError.conflict(
      'This truck has a trip in progress. Complete or cancel it before transferring the truck.',
    );
  }

  // Unfinished work follows the truck; finished work stays with whoever earned
  // it, flagged so the new owner sees the trip but not its figures.
  const [moved, inherited] = await Promise.all([
    Trip.updateMany(
      { truck: truck._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } },
      { $set: { owner: nextOwner, sharedWith: truck.sharedWith ?? [] } },
    ),
    previousOwner
      ? Trip.updateMany(
          { truck: truck._id, status: { $in: ['COMPLETED', 'CANCELLED'] }, inheritedFrom: null },
          { $set: { inheritedFrom: previousOwner } },
        )
      : Promise.resolve({ modifiedCount: 0 }),
  ]);

  // The driver answers to a manager, not to a vehicle.
  const driverId = truck.assignedDriver ?? null;
  let driverMoved = false;
  let driverDetached = false;

  if (driverId) {
    if (input.moveDriver && nextOwner) {
      await User.updateOne({ _id: driverId, role: 'DRIVER' }, { $set: { manager: nextOwner } });
      driverMoved = true;
    } else {
      truck.assignedDriver = null;
      if (truck.status === 'ASSIGNED') truck.status = 'AVAILABLE';
      driverDetached = true;
    }
  }

  // Close the outgoing stretch of history before opening the next one.
  const now = new Date();
  const open = truck.ownerHistory.find((entry) => !entry.to);
  if (open) open.to = now;
  truck.ownerHistory.push({ owner: nextOwner, from: now, to: null });

  truck.owner = nextOwner;
  await truck.save();

  const [from, to] = await Promise.all([
    previousOwner ? User.findById(previousOwner).select('name').lean() : null,
    nextOwner ? User.findById(nextOwner).select('name').lean() : null,
  ]);

  await recordAudit({
    ctx,
    action: 'TRUCK_UPDATED',
    summary: `${actor.name} transferred truck ${truck.truckNumber} from ${from?.name ?? 'nobody'} to ${to?.name ?? 'nobody'}`,
    entity: 'Truck',
    entityId: truck._id,
    metadata: {
      previousOwner: previousOwner ? String(previousOwner) : null,
      owner: nextOwner ? String(nextOwner) : null,
      tripsMoved: moved.modifiedCount,
      tripsInherited: inherited.modifiedCount,
      driverMoved,
      driverDetached,
    },
  });

  // Both sides hear about it: one has lost a truck, the other has gained one.
  await notify({
    users: [previousOwner, nextOwner].filter(Boolean) as Types.ObjectId[],
    type: 'GENERAL',
    title: 'A truck changed hands',
    message: `${truck.truckNumber} moved from ${from?.name ?? 'nobody'} to ${to?.name ?? 'nobody'}.`,
  });

  return {
    truck,
    tripsMoved: moved.modifiedCount,
    tripsInherited: inherited.modifiedCount,
    driverDetached,
    driverMoved,
  };
}

/* -------------------------------------------------------------------------- *
 * Sharing
 * -------------------------------------------------------------------------- */

/**
 * Grants another manager access to a truck, or changes the access they have.
 *
 * Every read path in the system has honoured `sharedWith` since ownership
 * landed — `ownerScopeFor` matches it, `permissionFor` ranks it, redaction
 * respects it — but nothing could create one. This is that missing half.
 *
 * Two rules decide the shape of this:
 *
 *   - An administrator shares, nobody else. A manager who could share their own
 *     truck could hand another manager's driver a route into their fleet, and
 *     the audit trail would show the sharing manager rather than whoever
 *     actually wanted the access.
 *   - A trip carries its truck's shares, denormalised, so that the trip list
 *     stays a single indexed query. That copy has to be kept in step here, or
 *     the sharee sees the truck and none of its work.
 *
 * VIEW is operational: the sharee sees the truck, its trips and its records,
 * with the money stripped server-side. EDIT is the full thing, short of
 * ownership itself — they still cannot transfer it or share it onward.
 */
export async function shareTruck(
  id: string,
  input: { user: string; permission: SharePermission },
  ctx: Ctx,
) {
  const actor = ctx.user;
  if (!isAdmin(actor)) throw ApiError.forbidden('Only an administrator can share a truck');

  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');

  if (refId(truck.owner) === null) {
    throw ApiError.badRequest('Give this truck an owner before sharing it');
  }
  if (refId(truck.owner) === input.user) {
    throw ApiError.badRequest('This truck already belongs to that manager');
  }

  const manager = await assertOwnerIsManager(input.user);

  const existing = truck.sharedWith.find((share) => refId(share.user) === input.user);
  if (existing) {
    if (existing.permission === input.permission) return truck;
    existing.permission = input.permission;
    existing.sharedBy = actor._id;
    existing.sharedAt = new Date();
  } else {
    truck.sharedWith.push({
      user: manager._id,
      permission: input.permission,
      sharedBy: actor._id,
      sharedAt: new Date(),
    });
  }

  await truck.save();
  await syncTripShares(truck);

  await recordAudit({
    ctx,
    action: 'TRUCK_UPDATED',
    summary: `${actor.name} shared truck ${truck.truckNumber} with ${manager.name} at ${input.permission}`,
    entity: 'Truck',
    entityId: truck._id,
    metadata: { sharedWith: input.user, permission: input.permission },
  });

  await notify({
    users: [manager._id],
    type: 'GENERAL',
    title: 'A truck was shared with you',
    message: `${truck.truckNumber} is now visible to you${input.permission === 'VIEW' ? ' for viewing' : ''}.`,
  });

  return truck;
}

/** Takes a share back. The truck's own manager is untouched. */
export async function unshareTruck(id: string, userId: string, ctx: Ctx) {
  const actor = ctx.user;
  if (!isAdmin(actor)) throw ApiError.forbidden('Only an administrator can change who a truck is shared with');

  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');

  const before = truck.sharedWith.length;
  truck.sharedWith = truck.sharedWith.filter((share) => refId(share.user) !== userId);
  if (truck.sharedWith.length === before) {
    throw ApiError.badRequest('This truck is not shared with that manager');
  }

  await truck.save();
  await syncTripShares(truck);

  const manager = await User.findById(userId).select('name').lean();
  await recordAudit({
    ctx,
    action: 'TRUCK_UPDATED',
    summary: `${actor.name} stopped sharing truck ${truck.truckNumber} with ${manager?.name ?? 'a manager'}`,
    entity: 'Truck',
    entityId: truck._id,
    metadata: { unsharedWith: userId },
  });

  return truck;
}

/**
 * Pushes a truck's share list down onto its trips.
 *
 * The denormalised copy is what makes the trip list one indexed query instead
 * of a lookup per row, and it is only correct for as long as something keeps it
 * in step. Completed and cancelled trips are left alone: they are history, and
 * a share granted today should not retroactively open last year's books.
 */
async function syncTripShares(truck: TruckDocument) {
  await Trip.updateMany(
    { truck: truck._id, status: { $nin: ['COMPLETED', 'CANCELLED'] } },
    { $set: { sharedWith: truck.sharedWith } },
  );
}
