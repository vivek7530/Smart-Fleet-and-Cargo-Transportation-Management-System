import { Types } from 'mongoose';
import { z } from 'zod';
import { User } from '../../models/User';
import { Truck } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { ApiError } from '../../lib/ApiError';
import { listQuerySchema, mergeFilters, paginate, resolveSort, searchFilter } from '../../lib/pagination';

/**
 * Drivers are simply users with the DRIVER role — the data is never duplicated.
 * This module presents them through a fleet-oriented lens.
 */
export const listDriversQuerySchema = listQuerySchema.extend({
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']).optional(),
  availability: z.enum(['ON_TRIP', 'AVAILABLE']).optional(),
});

export async function listDrivers(query: z.infer<typeof listDriversQuerySchema>) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'name', 'status', 'experienceYears']);

  let availabilityFilter: Record<string, unknown> | null = null;
  if (query.availability) {
    const busy = await Trip.distinct('driver', {
      status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
    });
    availabilityFilter = query.availability === 'ON_TRIP' ? { _id: { $in: busy } } : { _id: { $nin: busy } };
  }

  const filter = mergeFilters(
    { role: 'DRIVER' },
    query.status ? { status: query.status } : null,
    availabilityFilter,
    searchFilter(query.search, ['name', 'email', 'mobile', 'licenseNumber']),
  );

  const page = await paginate(User, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
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

export async function getDriver(id: string) {
  const driver = await User.findOne({ _id: id, role: 'DRIVER' });
  if (!driver) throw ApiError.notFound('That driver could not be found');

  const [assignedTruck, trips] = await Promise.all([
    Truck.findOne({ assignedDriver: driver._id }),
    Trip.find({ driver: driver._id }).sort({ createdAt: -1 }).limit(10).populate('truck', 'truckNumber'),
  ]);

  return {
    driver: driver.toJSON(),
    assignedTruck: assignedTruck?.toJSON() ?? null,
    recentTrips: trips.map((trip) => trip.toJSON()),
  };
}
