import { Types } from 'mongoose';
import { z } from 'zod';
import { User } from '../../models/User';
import { Truck } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { ApiError } from '../../lib/ApiError';
import { listQuerySchema, mergeFilters, paginate, resolveSort, searchFilter } from '../../lib/pagination';
import { isAdmin, redactTripFor, refId, type ActorLike } from '../../lib/ownership';

/**
 * Drivers are simply users with the DRIVER role — the data is never duplicated.
 * This module presents them through a fleet-oriented lens.
 */
export const listDriversQuerySchema = listQuerySchema.extend({
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']).optional(),
  availability: z.enum(['ON_TRIP', 'AVAILABLE']).optional(),
  /** Administrative views; ignored for a manager, whose own scope decides. */
  manager: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  unassigned: z.coerce.boolean().optional(),
});

/**
 * Which drivers this user may see.
 *
 * A manager sees the drivers who work under them. A driver with no manager is
 * deliberately NOT in that pool: an unassigned driver is a red flag for the
 * administrator to resolve, and letting any manager pick one up would be the
 * silent self-assignment the whole design is built to avoid.
 */
function driverScopeFor(user: ActorLike): Record<string, unknown> {
  if (isAdmin(user)) return { role: 'DRIVER' };
  return { role: 'DRIVER', manager: user._id };
}

export async function listDrivers(query: z.infer<typeof listDriversQuerySchema>, user: ActorLike) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'name', 'status', 'experienceYears']);

  let availabilityFilter: Record<string, unknown> | null = null;
  if (query.availability) {
    const busy = await Trip.distinct('driver', {
      status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
    });
    availabilityFilter = query.availability === 'ON_TRIP' ? { _id: { $in: busy } } : { _id: { $nin: busy } };
  }

  const filter = mergeFilters(
    driverScopeFor(user),
    query.status ? { status: query.status } : null,
    isAdmin(user) && query.manager ? { manager: query.manager } : null,
    isAdmin(user) && query.unassigned ? { manager: null } : null,
    availabilityFilter,
    searchFilter(query.search, ['name', 'email', 'mobile', 'licenseNumber']),
  );

  const page = await paginate(User, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'manager', select: 'name avatarColor' },
  });

  // Decorate the page with the assigned truck and live trip counters.
  const ids = page.items.map((item) => item.id as string);
  const objectIds = ids.map((id) => new Types.ObjectId(id));

  const [trucks, tripCounts] = await Promise.all([
    Truck.find({ assignedDriver: { $in: ids } }).select('truckNumber registrationNumber status assignedDriver'),
    Trip.aggregate<{ _id: { driver: Types.ObjectId; active: boolean }; count: number }>([
      { $match: { driver: { $in: objectIds } } },
      {
        $group: {
          _id: {
            driver: '$driver',
            active: { $in: ['$status', ['ASSIGNED', 'LOADING', 'IN_TRANSIT']] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const truckByDriver = new Map(trucks.map((truck) => [String(truck.assignedDriver), truck.toJSON()]));
  const counts = new Map<string, { total: number; active: number }>();
  for (const row of tripCounts) {
    const key = String(row._id.driver);
    const entry = counts.get(key) ?? { total: 0, active: 0 };
    entry.total += row.count;
    if (row._id.active) entry.active += row.count;
    counts.set(key, entry);
  }

  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      assignedTruck: truckByDriver.get(item.id as string) ?? null,
      tripCount: counts.get(item.id as string)?.total ?? 0,
      activeTripCount: counts.get(item.id as string)?.active ?? 0,
    })),
  };
}

export async function getDriver(id: string, user: ActorLike) {
  const driver = await User.findOne({ _id: id, role: 'DRIVER' });
  if (!driver) throw ApiError.notFound('That driver could not be found');
  // Same message either way: a driver who works for someone else must be
  // indistinguishable from one who does not exist. Their recent trips are
  // attached below, so this is the difference between a name and a work history.
  if (!isAdmin(user) && refId(driver.manager) !== refId(user._id)) {
    throw ApiError.notFound('That driver could not be found');
  }

  const [assignedTruck, trips] = await Promise.all([
    Truck.findOne({ assignedDriver: driver._id }),
    Trip.find({ driver: driver._id }).sort({ createdAt: -1 }).limit(10).populate('truck', 'truckNumber'),
  ]);

  return {
    driver: driver.toJSON(),
    assignedTruck: assignedTruck?.toJSON() ?? null,
    // A driver's history can span managers if they were transferred, so each
    // trip answers for itself rather than inheriting the driver's answer.
    recentTrips: trips.map((trip) => redactTripFor(trip.toJSON(), trip, user)),
  };
}
