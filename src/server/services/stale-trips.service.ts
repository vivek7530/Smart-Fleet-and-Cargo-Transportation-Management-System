import { Notification } from '../models/Notification';
import { Trip, type TripDocument } from '../models/Trip';
import { notify } from './notification.service';
import { recipientsForTruck } from './ownership.service';
import { indiaDayLabel, staleReasonFor, staleTripFilter } from '../lib/stale-trips';
import { logger } from '../lib/logger';

/**
 * The daily sweep for trips the fleet has lost track of.
 *
 * Without it nobody learns a trip has stalled until a dispatcher is refused a
 * booking, which can be weeks later — by which time the truck and driver have
 * been unusable the whole time and nobody knew why. The rule for "stale" is
 * the same one the dispatch gate enforces, from `lib/stale-trips`.
 */

/**
 * A stalled trip is reported once, then left alone for this long. Repeating it
 * every morning would train everyone to ignore the notification, which is the
 * one outcome that would make this worse than silence.
 */
export const REMINDER_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure half of the decision, so the interval can be tested without a database. */
export function shouldRemind(lastNotifiedAt: Date | null | undefined, now = new Date()) {
  if (!lastNotifiedAt) return true;
  return now.getTime() - lastNotifiedAt.getTime() >= REMINDER_INTERVAL_DAYS * DAY_MS;
}

export interface StaleSweepResult {
  /** Trips the rule flagged. */
  scanned: number;
  /** Trips that produced a notification this run. */
  notified: number;
  /** Trips still inside their quiet period. */
  quiet: number;
  /** Trips this run could not report on — see the log for why. */
  failed: number;
}

function wording(trip: TripDocument, reason: 'NEVER_LEFT' | 'OVERDUE_RETURN') {
  const truck = (trip.truck as unknown as { truckNumber?: string } | null)?.truckNumber;
  const driver = (trip.driver as unknown as { name?: string } | null)?.name;
  const held = [truck && `truck ${truck}`, driver && `driver ${driver}`].filter(Boolean).join(' and ');
  const consequence = held
    ? ` Its ${held} cannot be booked onto new work until it is rescheduled, completed or cancelled.`
    : '';

  return reason === 'OVERDUE_RETURN'
    ? {
      title: `Trip ${trip.tripCode} is overdue`,
      message: `It was due back on ${indiaDayLabel(trip.expectedDeliveryDate)} and is still in transit.${consequence}`,
    }
    : {
      title: `Trip ${trip.tripCode} was never dispatched`,
      message: `It was due to start on ${indiaDayLabel(trip.startDate)} and has not left.${consequence}`,
    };
}

export async function sweepStaleTrips(now = new Date()): Promise<StaleSweepResult> {
  const trips = await Trip.find(staleTripFilter(now))
    .select('tripCode status startDate expectedDeliveryDate truck driver')
    .populate('truck', 'truckNumber')
    .populate('driver', 'name');

  const result: StaleSweepResult = { scanned: trips.length, notified: 0, quiet: 0, failed: 0 };

  for (const trip of trips) {
    // One unreportable trip must not silence the rest. A sweep that stops at
    // the first failure leaves every trip after it unreported, and because
    // nothing was written they look "already quiet" to nobody — the run simply
    // goes missing. Each trip is reported, or logged and stepped over.
    try {
      // The query and the in-hand rule agree by construction; this keeps that
      // true even if one of them is ever changed alone.
      const reason = staleReasonFor(trip, now);
      if (!reason) continue;

      const last = await Notification.findOne({ type: 'TRIP_STALLED', entityId: trip._id })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean();

      if (!shouldRemind(last?.createdAt, now)) {
        result.quiet += 1;
        continue;
      }

      const { title, message } = wording(trip, reason);
      // Whoever owns or shares the truck, plus the driver who is standing by.
      const recipients = await recipientsForTruck(
        (trip.truck as unknown as { _id?: unknown } | null)?._id as never ?? null,
      );

      await notify({
        users: [...recipients, ...(trip.driver ? [trip.driver] : [])],
        type: 'TRIP_STALLED',
        title,
        message,
        link: `/trips/${trip._id}`,
        entity: 'Trip',
        entityId: trip._id,
      });
      result.notified += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(
        `Stale trip sweep could not report trip ${trip.tripCode}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.info(
    `Stale trip sweep: ${result.scanned} flagged, ${result.notified} reported, ${result.quiet} still quiet${
      result.failed ? `, ${result.failed} failed` : ''
    }`,
  );
  return result;
}
