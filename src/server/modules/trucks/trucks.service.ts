import type { Ctx } from '../../api/context';
import { Types } from 'mongoose';
import { Truck, type TruckDocument } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { User } from '../../models/User';
import { Maintenance } from '../../models/Maintenance';
import { FuelRecord } from '../../models/FuelRecord';
import { DocumentRecord } from '../../models/DocumentRecord';
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
import type { CreateTruckInput, UpdateTruckInput } from './trucks.validation';

const SEARCH_FIELDS = ['truckNumber', 'registrationNumber', 'make', 'model', 'insuranceProvider'];
const SORT_FIELDS = ['createdAt', 'truckNumber', 'year', 'capacityTons', 'status', 'odometerKm'];

type TruckListQuery = ListQuery & {
  status?: string;
  fuelType?: string;
  assignedDriver?: string;
  unassigned?: boolean;
};

export async function listTrucks(query: TruckListQuery) {
  const { sortBy, sortDir } = resolveSort(query, SORT_FIELDS);

  const filter = mergeFilters(
    query.status ? { status: query.status } : null,
    query.fuelType ? { fuelType: query.fuelType } : null,
    query.assignedDriver ? { assignedDriver: query.assignedDriver } : null,
    query.unassigned ? { assignedDriver: null } : null,
    searchFilter(query.search, SEARCH_FIELDS),
  );

  return paginate(Truck, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'assignedDriver', select: 'name mobile email avatarColor' },
  });
}

export async function getTruck(id: string) {
  const truck = await Truck.findById(id).populate('assignedDriver', 'name mobile email avatarColor licenseNumber');
  if (!truck) throw ApiError.notFound('That truck could not be found');

  const [recentTrips, recentMaintenance, recentFuel, documents, totals] = await Promise.all([
    Trip.find({ truck: truck._id }).sort({ createdAt: -1 }).limit(5).populate('driver', 'name'),
    Maintenance.find({ truck: truck._id }).sort({ date: -1 }).limit(5),
    FuelRecord.find({ truck: truck._id }).sort({ date: -1 }).limit(5),
    DocumentRecord.find({ truck: truck._id }).sort({ createdAt: -1 }).limit(10),
    truckTotals(String(truck._id)),
  ]);

  return {
    truck: truck.toJSON(),
    recentTrips: recentTrips.map((t) => t.toJSON()),
    recentMaintenance: recentMaintenance.map((m) => m.toJSON()),
    recentFuel: recentFuel.map((f) => f.toJSON()),
    documents: documents.map((d) => d.toJSON()),
    totals,
  };
}

async function truckTotals(truckId: string) {
  const truckObjectId = new Types.ObjectId(truckId);

  const [trips, maintenance, fuel] = await Promise.all([
    Trip.aggregate<{ _id: null; count: number; revenue: number }>([
      { $match: { truck: truckObjectId } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$revenue' } } },
    ]),
    Maintenance.aggregate<{ _id: null; cost: number; count: number }>([
      { $match: { truck: truckObjectId } },
      { $group: { _id: null, cost: { $sum: '$cost' }, count: { $sum: 1 } } },
    ]),
    FuelRecord.aggregate<{ _id: null; cost: number; litres: number }>([
      { $match: { truck: truckObjectId } },
      { $group: { _id: null, cost: { $sum: '$totalCost' }, litres: { $sum: '$litres' } } },
    ]),
  ]);

  return {
    totalTrips: trips[0]?.count ?? 0,
    totalRevenue: trips[0]?.revenue ?? 0,
    maintenanceCost: maintenance[0]?.cost ?? 0,
    maintenanceCount: maintenance[0]?.count ?? 0,
    fuelCost: fuel[0]?.cost ?? 0,
    fuelLitres: Math.round((fuel[0]?.litres ?? 0) * 100) / 100,
  };
}

export async function createTruck(input: CreateTruckInput, ctx: Ctx) {
  const actor = ctx.user;
  if (input.assignedDriver) await assertDriverAssignable(input.assignedDriver);

  const truck = await Truck.create({
    ...input,
    status: input.assignedDriver ? 'ASSIGNED' : input.status,
    createdBy: actor._id,
  });

  if (input.assignedDriver) await detachDriverFromOtherTrucks(input.assignedDriver, String(truck._id));

  await recordAudit({
    ctx,
    action: 'TRUCK_CREATED',
    summary: `${actor.name} added truck ${truck.truckNumber}`,
    entity: 'Truck',
    entityId: truck._id,
    metadata: { registrationNumber: truck.registrationNumber },
  });

  return truck;
}

export async function updateTruck(id: string, input: UpdateTruckInput, ctx: Ctx) {
  const actor = ctx.user;
  const truck = await Truck.findById(id);
  if (!truck) throw ApiError.notFound('That truck could not be found');

  if (input.assignedDriver && input.assignedDriver !== String(truck.assignedDriver)) {
    await assertDriverAssignable(input.assignedDriver);
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

  Object.assign(truck, sanitiseTruckPatch(input));
  if (input.assignedDriver !== undefined) {
    truck.assignedDriver = input.assignedDriver ? (input.assignedDriver as unknown as TruckDocument['assignedDriver']) : null;
    if (!input.status) {
      truck.status = input.assignedDriver ? 'ASSIGNED' : truck.status === 'ASSIGNED' ? 'AVAILABLE' : truck.status;
    }
  }

  await truck.save();
  if (input.assignedDriver) await detachDriverFromOtherTrucks(input.assignedDriver, String(truck._id));

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

  if (driverId) {
    const driver = await assertDriverAssignable(driverId);
    truck.assignedDriver = driver._id;
    if (truck.status === 'AVAILABLE') truck.status = 'ASSIGNED';
    await truck.save();
    await detachDriverFromOtherTrucks(driverId, String(truck._id));

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

  const activeTrips = await Trip.countDocuments({
    truck: truck._id,
    status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
  });
  if (activeTrips > 0) {
    throw ApiError.conflict(
      `Truck ${truck.truckNumber} is used by ${activeTrips} open trip${activeTrips > 1 ? 's' : ''}. Close them first.`,
    );
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

async function assertDriverAssignable(driverId: string) {
  const driver = await User.findOne({ _id: driverId, role: 'DRIVER' });
  if (!driver) throw ApiError.badRequest('The selected driver could not be found');
  if (driver.status !== 'ACTIVE') throw ApiError.badRequest('Only active drivers can be assigned to a truck');
  return driver;
}

/** A driver may hold only one truck at a time. */
async function detachDriverFromOtherTrucks(driverId: string, keepTruckId: string) {
  await Truck.updateMany(
    { assignedDriver: driverId, _id: { $ne: keepTruckId } },
    { assignedDriver: null, $set: { status: 'AVAILABLE' } },
  );
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


