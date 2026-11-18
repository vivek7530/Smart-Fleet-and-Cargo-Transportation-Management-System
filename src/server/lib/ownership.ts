/**
 * Per-manager ownership rules, in one place.
 *
 * A truck belongs to exactly one manager. Its trips inherit that owner, and an
 * administrator may additionally share a truck with other managers at VIEW or
 * EDIT. Everything in this file is **pure** — no models, no database — so the
 * rules can be unit tested directly and so importing it never drags Mongoose
 * into a module that does not need it. The database-backed helpers that build
 * on these rules live in `src/server/services/ownership.service.ts`.
 *
 * Three invariants worth keeping in mind while reading:
 *
 * 1. An ADMIN is never restricted. Every function here short-circuits for them,
 *    so administrative reach is decided once rather than re-checked at each of
 *    the thirty-odd call sites.
 * 2. "Not yours" reads as "does not exist". `assertCanSee` throws 404, not 403,
 *    so a manager cannot probe ids to learn what another manager holds.
 * 3. Seeing a record and seeing its money are different permissions. A VIEW
 *    sharee, and anyone looking at a trip inherited from a previous owner, gets
 *    the operational detail with the figures stripped.
 */
import { ApiError } from './ApiError';
import type { SharePermission } from '../types/enums';

export type AccessMode = 'VIEW' | 'EDIT';

/**
 * A Mongoose ref is either a raw ObjectId or, once populated, a document. Both
 * shapes reach these helpers depending on whether the caller populated the
 * field, so every comparison goes through here.
 */
export type Ref = unknown;

export interface ShareLike {
  user: Ref;
  permission: SharePermission;
}

/** The ownership-bearing shape of a Truck or a Trip. */
export interface OwnedLike {
  owner?: Ref;
  sharedWith?: ShareLike[];
  /** Trips only: set when the figures belong to a previous owner. */
  inheritedFrom?: Ref;
}

/** The caller, reduced to what ownership actually depends on. */
export interface ActorLike {
  _id: Ref;
  role: string;
}

/**
 * Normalises a ref to a comparable string, whether it arrived raw or populated.
 * Returns null for a missing ref so an unowned truck never accidentally matches
 * an unowned anything else.
 */
export function refId(value: Ref): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
    const inner = (value as { _id: unknown })._id;
    return inner === null || inner === undefined ? null : String(inner);
  }
  return String(value);
}

function sameRef(a: Ref, b: Ref): boolean {
  const left = refId(a);
  const right = refId(b);
  return left !== null && left === right;
}

export function isAdmin(user: ActorLike): boolean {
  return user.role === 'ADMIN';
}

/**
 * The permission a user holds on a document, or null if they hold none.
 * Ownership outranks a share, so an owner is always treated as EDIT.
 */
export function permissionFor(doc: OwnedLike, user: ActorLike): SharePermission | null {
  if (sameRef(doc.owner, user._id)) return 'EDIT';
  const share = (doc.sharedWith ?? []).find((entry) => sameRef(entry.user, user._id));
  return share ? share.permission : null;
}

/**
 * Can this user reach the document at all, at the given level?
 *
 * An unowned truck deliberately matches nobody: it is a red flag for the
 * administrator to resolve, and no manager action may quietly claim it.
 */
export function canAccess(doc: OwnedLike, user: ActorLike, mode: AccessMode = 'VIEW'): boolean {
  if (isAdmin(user)) return true;
  const permission = permissionFor(doc, user);
  if (!permission) return false;
  return mode === 'VIEW' || permission === 'EDIT';
}

/**
 * A Mongo filter fragment restricting a query to what this user may see.
 * Returns `{}` for an administrator, which `mergeFilters` drops harmlessly.
 *
 * Pass this as the FIRST argument to `mergeFilters` so the owner predicate
 * leads, matching the `{ owner: 1, ... }` compound indexes on Truck and Trip.
 */
export function ownerScopeFor(user: ActorLike, mode: AccessMode = 'VIEW'): Record<string, unknown> {
  if (isAdmin(user)) return {};
  const shareMatch: Record<string, unknown> =
    mode === 'EDIT' ? { user: user._id, permission: 'EDIT' } : { user: user._id };
  return { $or: [{ owner: user._id }, { sharedWith: { $elemMatch: shareMatch } }] };
}

/**
 * Guards a document a user fetched by id.
 *
 * Throws 404 rather than 403 on purpose: a manager who can tell "exists but is
 * not yours" from "does not exist" can map another manager's fleet by probing
 * identifiers. `label` names the thing in the message ("truck", "trip").
 */
export function assertCanSee(doc: OwnedLike, user: ActorLike, label = 'record'): void {
  if (canAccess(doc, user, 'VIEW')) return;
  throw ApiError.notFound(`That ${label} could not be found`);
}

/**
 * Guards a change. By the time this runs the user has usually already been
 * allowed to see the document, so 403 is the honest answer — it tells a VIEW
 * sharee that the thing exists but is not theirs to change, which is exactly
 * what they need to know.
 */
export function assertCanEdit(doc: OwnedLike, user: ActorLike, label = 'record'): void {
  if (canAccess(doc, user, 'EDIT')) return;
  if (canAccess(doc, user, 'VIEW')) {
    throw ApiError.forbidden(`This ${label} was shared with you for viewing only`);
  }
  throw ApiError.notFound(`That ${label} could not be found`);
}

/**
 * May this user see the money on this document?
 *
 * Two cases hide it, and both are deliberate:
 *   - a VIEW-only sharee is there to help operationally, not to read another
 *     manager's margins;
 *   - an inherited trip was finished and paid for by a previous owner, so the
 *     figures are not the current owner's to see or to count.
 *
 * Administrators always see everything, which is what makes the audit trail
 * and the handover reports trustworthy.
 */
export function canSeeFinancials(doc: OwnedLike, user: ActorLike): boolean {
  if (isAdmin(user)) return true;
  if (refId(doc.inheritedFrom) !== null) return false;
  return permissionFor(doc, user) === 'EDIT';
}

/** The money fields stripped from a Trip when `canSeeFinancials` is false. */
export const TRIP_FINANCIAL_FIELDS = [
  'revenue',
  'transportationCost',
  'driverExpenseTotal',
  'fuelCost',
  'totalExpenses',
  'profit',
] as const;

/** The money fields stripped from a Truck. */
export const TRUCK_FINANCIAL_FIELDS = ['purchasePrice'] as const;

/**
 * Removes the named fields from a plain object, returning a copy.
 *
 * Redaction happens server-side, on the serialised payload, because hiding a
 * column in the UI still ships the numbers in the JSON — and the JSON is what
 * a determined manager would read.
 */
export function omitFields<T extends Record<string, unknown>>(
  value: T,
  fields: readonly string[],
): T {
  const copy = { ...value };
  for (const field of fields) delete copy[field];
  return copy;
}

/**
 * Serialises a trip for a given viewer, stripping the figures when they are not
 * theirs and flagging that fact so the UI can say so rather than render blanks.
 */
export function redactTripFor<T extends Record<string, unknown>>(
  trip: T,
  doc: OwnedLike,
  user: ActorLike,
): T & { canSeeFinancials: boolean } {
  const allowed = canSeeFinancials(doc, user);
  const base = allowed ? { ...trip } : omitFields(trip, TRIP_FINANCIAL_FIELDS);
  return { ...base, canSeeFinancials: allowed };
}

/** The same, for a truck. */
export function redactTruckFor<T extends Record<string, unknown>>(
  truck: T,
  doc: OwnedLike,
  user: ActorLike,
): T & { canSeeFinancials: boolean } {
  const allowed = canSeeFinancials(doc, user);
  const base = allowed ? { ...truck } : omitFields(truck, TRUCK_FINANCIAL_FIELDS);
  return { ...base, canSeeFinancials: allowed };
}
