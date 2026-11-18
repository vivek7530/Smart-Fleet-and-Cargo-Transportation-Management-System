/**
 * What one manager holds, gathered into a single read.
 *
 * Every list in this app is already ownership-scoped, so a manager browsing
 * Trucks, Drivers or Trips sees only their own. What was missing was one place
 * that answers "what am I responsible for right now?" without three trips
 * through three screens — which is what this module serves.
 *
 * Nothing here consults a query parameter. The caller is the scope, so there is
 * no identifier a manager could pass to look at somebody else's roster.
 */
import { Types } from 'mongoose';
import { Trip } from '../../models/Trip';
import { Truck } from '../../models/Truck';
import { User } from '../../models/User';
import { ownerScopeFor, type ActorLike } from '../../lib/ownership';
import type { TripStatus, TruckStatus } from '../../types/enums';

/** The trip statuses that mean "happening now", used for the live counters. */
const ACTIVE_TRIP_STATUSES: TripStatus[] = ['ASSIGNED', 'LOADING', 'IN_TRANSIT'];

export interface MyFleetTruck {
  id: string;
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  status: TruckStatus;
  assignedDriver: { id: string; name: string; avatarColor?: string } | null;
  /** VIEW or EDIT when the truck is another manager's, shared with this one. */
  access: 'OWNER' | 'VIEW' | 'EDIT';
}

export interface MyFleetDriver {
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

export interface MyFleetTrip {
  id: string;
  tripCode: string;
  status: TripStatus;
  pickupLocation: string;
  deliveryLocation: string;
  startDate: Date;
  expectedDeliveryDate: Date;
  truck: { id: string; truckNumber: string } | null;
  driver: { id: string; name: string; avatarColor?: string } | null;
}

export interface MyFleetReport {
  trucks: MyFleetTruck[];
  drivers: MyFleetDriver[];
  trips: MyFleetTrip[];
  totals: {
    trucks: number;
    sharedTrucks: number;
    drivers: number;
    activeTrips: number;
    trucksOnRoad: number;
    driversAvailable: number;
  };
}

type LeanRef = { _id: Types.ObjectId; name: string; avatarColor?: string } | null | undefined;

/**
 * Everything this manager is responsible for: their trucks (owned and shared),
 * the drivers on their roster, and the trips currently running.
 *
 * Trips are limited to the live ones on purpose. A manager opening this wants
 * to know what is moving, not to page through last year — the Trips screen is
 * where history lives.
 */
export async function getMyFleet(user: ActorLike): Promise<MyFleetReport> {
  const scope = ownerScopeFor(user);

  const [trucks, drivers, trips] = await Promise.all([
    Truck.find(scope)
      .select('truckNumber registrationNumber make model year capacityTons status owner sharedWith assignedDriver')
      .populate('assignedDriver', 'name avatarColor')
      .sort({ truckNumber: 1 })
      .lean(),
    User.find({ role: 'DRIVER', manager: user._id, status: { $ne: 'ARCHIVED' } })
      .select('name mobile email avatarColor status licenseNumber licenseExpiry')
      .sort({ name: 1 })
      .lean(),
    Trip.find({ ...scope, status: { $in: ACTIVE_TRIP_STATUSES } })
      .select('tripCode status pickupLocation deliveryLocation startDate expectedDeliveryDate truck driver')
      .populate('truck', 'truckNumber')
      .populate('driver', 'name avatarColor')
      .sort({ startDate: 1 })
      .lean(),
  ]);

  const myId = String(user._id);

  const truckRows: MyFleetTruck[] = trucks.map((truck) => {
    const share = (truck.sharedWith ?? []).find((entry) => String(entry.user) === myId);
    const driver = truck.assignedDriver as LeanRef;

    return {
      id: String(truck._id),
      truckNumber: truck.truckNumber,
      registrationNumber: truck.registrationNumber,
      make: truck.make,
      model: truck.model,
      year: truck.year,
      capacityTons: truck.capacityTons,
      status: truck.status,
      assignedDriver: driver
        ? { id: String(driver._id), name: driver.name, avatarColor: driver.avatarColor }
        : null,
      access: String(truck.owner ?? '') === myId ? 'OWNER' : (share?.permission ?? 'VIEW'),
    };
  });

  // One aggregate for every driver's live trip count, rather than a query each.
  const driverIds = drivers.map((driver) => driver._id);
  const [busy, assignedTrucks] = await Promise.all([
    Trip.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { driver: { $in: driverIds }, status: { $in: ACTIVE_TRIP_STATUSES } } },
      { $group: { _id: '$driver', count: { $sum: 1 } } },
    ]),
    Truck.find({ assignedDriver: { $in: driverIds } })
      .select('truckNumber assignedDriver')
      .lean(),
  ]);

  const activeByDriver = new Map(busy.map((row) => [String(row._id), row.count]));
  const truckByDriver = new Map(
    assignedTrucks.map((truck) => [
      String(truck.assignedDriver),
      { id: String(truck._id), truckNumber: truck.truckNumber },
    ]),
  );

  const driverRows: MyFleetDriver[] = drivers.map((driver) => {
    const id = String(driver._id);
    return {
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
  });

  const tripRows: MyFleetTrip[] = trips.map((trip) => {
    const truck = trip.truck as unknown as { _id: Types.ObjectId; truckNumber: string } | null;
    const driver = trip.driver as LeanRef;

    return {
      id: String(trip._id),
      tripCode: trip.tripCode,
      status: trip.status,
      pickupLocation: trip.pickupLocation,
      deliveryLocation: trip.deliveryLocation,
      startDate: trip.startDate,
      expectedDeliveryDate: trip.expectedDeliveryDate,
      truck: truck ? { id: String(truck._id), truckNumber: truck.truckNumber } : null,
      driver: driver ? { id: String(driver._id), name: driver.name, avatarColor: driver.avatarColor } : null,
    };
  });

  return {
    trucks: truckRows,
    drivers: driverRows,
    trips: tripRows,
    totals: {
      trucks: truckRows.filter((truck) => truck.access === 'OWNER').length,
      sharedTrucks: truckRows.filter((truck) => truck.access !== 'OWNER').length,
      drivers: driverRows.length,
      activeTrips: tripRows.length,
      trucksOnRoad: truckRows.filter((truck) => truck.status === 'IN_TRIP').length,
      driversAvailable: driverRows.filter(
        (driver) => driver.status === 'ACTIVE' && driver.activeTripCount === 0,
      ).length,
    },
  };
}
