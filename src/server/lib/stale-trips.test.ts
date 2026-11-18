import assert from 'node:assert/strict';
import test from 'node:test';
import type { TripStatus } from '../types/enums';
import { staleReasonFor, staleTripFilter, startOfIndiaToday } from './stale-trips';

/**
 * The whole rule turns on one boundary: the moment the Indian calendar day
 * began. Everything here pins a fixed `now` so the cases stay honest whatever
 * day the suite runs on, and whatever timezone the machine is set to.
 */

// 18 Nov 2026, 09:00 IST — a safely mid-morning "now".
const NOW = new Date('2026-11-18T03:30:00.000Z');

const trip = (status: TripStatus, startDate: string, expectedDeliveryDate = startDate) => ({
  status,
  startDate: new Date(startDate),
  expectedDeliveryDate: new Date(expectedDeliveryDate),
});

test('the India day boundary is 18:30 UTC the evening before', () => {
  assert.equal(startOfIndiaToday(NOW).toISOString(), '2026-11-17T18:30:00.000Z');
});

test('a trip that was due to leave on a past day and has not is stale', () => {
  assert.equal(staleReasonFor(trip('ASSIGNED', '2026-10-24T00:00:00Z'), NOW), 'NEVER_LEFT');
  assert.equal(staleReasonFor(trip('PLANNED', '2026-11-17T00:00:00Z'), NOW), 'NEVER_LEFT');
  assert.equal(staleReasonFor(trip('LOADING', '2026-11-17T00:00:00Z'), NOW), 'NEVER_LEFT');
});

test('a trip due to leave today or later is not stale', () => {
  assert.equal(staleReasonFor(trip('ASSIGNED', '2026-11-18T00:00:00Z'), NOW), null);
  assert.equal(staleReasonFor(trip('PLANNED', '2026-11-25T00:00:00Z'), NOW), null);
});

test('the boundary belongs to today, not to yesterday', () => {
  // 18:30 UTC is midnight in Kolkata: the first instant of today.
  assert.equal(staleReasonFor(trip('ASSIGNED', '2026-11-17T18:30:00Z'), NOW), null);
  // One millisecond earlier is still yesterday, so that one never left.
  assert.equal(staleReasonFor(trip('ASSIGNED', '2026-11-17T18:29:59.999Z'), NOW), 'NEVER_LEFT');
});

test('a trip still on the road past its delivery date is overdue', () => {
  assert.equal(
    staleReasonFor(trip('IN_TRANSIT', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'), NOW),
    'OVERDUE_RETURN',
  );
  // Due back today: late in the day, perhaps, but not overdue.
  assert.equal(
    staleReasonFor(trip('IN_TRANSIT', '2026-11-01T00:00:00Z', '2026-11-18T00:00:00Z'), NOW),
    null,
  );
});

test('an in-transit trip is judged on its delivery date, never its start', () => {
  // Left weeks ago, still due back tomorrow — that is simply a long haul.
  assert.equal(
    staleReasonFor(trip('IN_TRANSIT', '2026-10-01T00:00:00Z', '2026-11-19T00:00:00Z'), NOW),
    null,
  );
});

test('a settled trip is never stale, however old', () => {
  for (const status of ['COMPLETED', 'CANCELLED', 'DELIVERED'] as TripStatus[]) {
    assert.equal(staleReasonFor(trip(status, '2020-01-01T00:00:00Z'), NOW), null);
  }
});

test('the Mongo predicate asks the same question as the in-hand check', () => {
  const filter = staleTripFilter(NOW);
  const boundary = startOfIndiaToday(NOW);

  assert.deepEqual(filter, {
    $or: [
      { status: 'IN_TRANSIT', expectedDeliveryDate: { $lt: boundary } },
      { status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING'] }, startDate: { $lt: boundary } },
    ],
  });

  // A plain range predicate rather than a computed one, so the existing
  // { driver, status, startDate, expectedDeliveryDate } indexes can serve it.
  for (const branch of filter.$or) {
    assert.equal(JSON.stringify(branch).includes('$expr'), false);
  }
});
