import type { TripStatus } from '../types/enums';

/**
 * A stale trip is one the fleet has lost track of: it was due to leave on a
 * past date and never did, or it went out and never came back. Either way the
 * truck and driver on it are unaccounted for, which is why booking them onto
 * something new is refused until the trip is settled.
 *
 * The rule lives here, in one place, because four things ask it and they must
 * not drift apart: the dispatch gate in `trips.service`, the "needs attention"
 * filter behind the trips list, the dashboard's count, and the badges on a
 * trip row.
 */

/** Statuses a trip sits in before it has actually left. */
const UNDEPARTED: TripStatus[] = ['PLANNED', 'ASSIGNED', 'LOADING'];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type StaleReason = 'NEVER_LEFT' | 'OVERDUE_RETURN';

/** The fleet works to the Indian calendar day, not the server's. */
export function indiaDayKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

/** `24 Oct 2026` — the same day, written for a person to read. */
export function indiaDayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

/**
 * The instant the current Indian calendar day began, as a UTC `Date`.
 *
 * Everything below compares against this one boundary rather than formatting
 * each row's date into a string: `date < startOfIndiaToday()` asks exactly the
 * same question as `indiaDayKey(date) < indiaDayKey(now)`, but it is a plain
 * range predicate, so Mongo can answer it from the existing
 * `{ driver, status, startDate, expectedDeliveryDate }` indexes instead of
 * scanning the collection. India keeps one offset all year, with no daylight
 * saving, which is what makes the arithmetic safe.
 */
export function startOfIndiaToday(now = new Date()) {
  const [year, month, day] = indiaDayKey(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Why this trip is stale, for a trip already in hand — or `null` if it is fine. */
export function staleReasonFor(
  trip: { status: TripStatus; startDate: Date; expectedDeliveryDate: Date },
  now = new Date(),
): StaleReason | null {
  const dayStart = startOfIndiaToday(now);
  if (trip.status === 'IN_TRANSIT') {
    return trip.expectedDeliveryDate < dayStart ? 'OVERDUE_RETURN' : null;
  }
  if (UNDEPARTED.includes(trip.status)) {
    return trip.startDate < dayStart ? 'NEVER_LEFT' : null;
  }
  return null;
}

/** The same rule as a Mongo predicate, to be merged into a trip query. */
export function staleTripFilter(now = new Date()) {
  const dayStart = startOfIndiaToday(now);
  return {
    $or: [
      { status: 'IN_TRANSIT', expectedDeliveryDate: { $lt: dayStart } },
      { status: { $in: UNDEPARTED }, startDate: { $lt: dayStart } },
    ],
  };
}
