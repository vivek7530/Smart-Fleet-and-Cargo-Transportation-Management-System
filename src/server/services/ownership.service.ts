/**
 * Ownership questions that need the database.
 *
 * The rules themselves live in `src/server/lib/ownership.ts` and are pure. This
 * module is what the child modules — fuel, expenses, cargo, maintenance,
 * breakdowns, costs, documents — call, because none of them carry an owner of
 * their own. They only reference a truck or a trip, so the only way to know who
 * a fuel receipt belongs to is to look at the truck it was bought for.
 *
 * Everything here is the same shape: resolve the parent, apply the rule, and
 * report "not found" rather than "not yours" so identifiers cannot be probed.
 */
import { Types } from 'mongoose';
import { Trip, type TripDocument } from '../models/Trip';
import { Truck, type TruckDocument } from '../models/Truck';
import { User } from '../models/User';
import { ApiError } from '../lib/ApiError';
import { canAccess, isAdmin, ownerScopeFor, type AccessMode, type ActorLike } from '../lib/ownership';

/**
 * The trucks this user may reach, or `null` meaning "no restriction" — which is
 * what an administrator gets.
 *
 * `null` and `[]` mean opposite things and must not be confused: an empty array
 * is a manager who holds nothing, and a filter built from it must match no
 * records at all. Callers use `truckScopeFilter` below rather than building
 * that filter themselves, precisely so the empty case cannot be got wrong.
 */
export async function accessibleTruckIds(
  user: ActorLike,
  mode: AccessMode = 'VIEW',
): Promise<Types.ObjectId[] | null> {
  if (isAdmin(user)) return null;
  const trucks = await Truck.find(ownerScopeFor(user, mode)).select('_id').lean();
  return trucks.map((truck) => truck._id);
}

/**
 * A filter fragment restricting a child collection to this user's trucks.
 *
 * `field` is the name of the truck reference on that collection. Returns `null`
 * for an administrator so `mergeFilters` drops it.
 */
export async function truckScopeFilter(
  user: ActorLike,
  mode: AccessMode = 'VIEW',
  field = 'truck',
): Promise<Record<string, unknown> | null> {
  const ids = await accessibleTruckIds(user, mode);
  if (ids === null) return null;
  return { [field]: { $in: ids } };
}

/** The same, for collections that reference a trip instead of a truck. */
export async function tripScopeFilter(
  user: ActorLike,
  mode: AccessMode = 'VIEW',
  field = 'trip',
): Promise<Record<string, unknown> | null> {
  if (isAdmin(user)) return null;
  const trips = await Trip.find(ownerScopeFor(user, mode)).select('_id').lean();
  return { [field]: { $in: trips.map((trip) => trip._id) } };
}

/**
 * Loads a trip the user is allowed to act on, or refuses.
 *
 * This is the guard for every child record that arrives carrying a trip id from
 * the request body. Without it a manager can attach a cost, an expense or a
 * fuel receipt to any trip in the system simply by knowing its identifier.
 */
export async function requireTripAccess(
  tripId: string,
  user: ActorLike,
  mode: AccessMode = 'EDIT',
): Promise<TripDocument> {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.badRequest('The selected trip could not be found');
  if (!canAccess(trip, user, mode)) {
    // Deliberately the same message as "no such trip".
    throw ApiError.badRequest('The selected trip could not be found');
  }
  return trip;
}

/** The same, for a truck id arriving from a request body. */
export async function requireTruckAccess(
  truckId: string,
  user: ActorLike,
  mode: AccessMode = 'EDIT',
): Promise<TruckDocument> {
  const truck = await Truck.findById(truckId);
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');
  if (!canAccess(truck, user, mode)) {
    throw ApiError.badRequest('The selected truck could not be found');
  }
  return truck;
}

/**
 * Who should hear about something that happened to a truck: the administrators,
 * the manager who owns it, and anyone it was shared with.
 *
 * This replaces broadcasting to every manager in the company. Administrators
 * are always included, so nothing in the system happens without them being able
 * to see it, while a manager only hears about their own trucks.
 */
export async function recipientsForTruck(
  truckId: Types.ObjectId | string | null | undefined,
): Promise<Types.ObjectId[]> {
  const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' }).select('_id').lean();
  const recipients = admins.map((admin) => admin._id);
  if (!truckId) return recipients;

  const truck = await Truck.findById(truckId).select('owner sharedWith').lean();
  if (truck?.owner) recipients.push(truck.owner as Types.ObjectId);
  for (const share of truck?.sharedWith ?? []) {
    if (share?.user) recipients.push(share.user as Types.ObjectId);
  }
  return recipients;
}

/** The same, resolved through a trip's truck. */
export async function recipientsForTrip(
  tripId: Types.ObjectId | string | null | undefined,
): Promise<Types.ObjectId[]> {
  if (!tripId) return recipientsForTruck(null);
  const trip = await Trip.findById(tripId).select('truck').lean();
  return recipientsForTruck((trip?.truck as Types.ObjectId | null) ?? null);
}
