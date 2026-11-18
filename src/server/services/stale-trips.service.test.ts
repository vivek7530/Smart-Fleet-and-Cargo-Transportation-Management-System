import assert from 'node:assert/strict';
import test from 'node:test';
import { REMINDER_INTERVAL_DAYS, shouldRemind } from './stale-trips.service';

const NOW = new Date('2026-11-18T03:30:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

test('a trip nobody has been told about is reported at once', () => {
  assert.equal(shouldRemind(null, NOW), true);
  assert.equal(shouldRemind(undefined, NOW), true);
});

test('a trip already reported stays quiet for the whole interval', () => {
  assert.equal(shouldRemind(daysBefore(0), NOW), false);
  assert.equal(shouldRemind(daysBefore(1), NOW), false);
  assert.equal(shouldRemind(daysBefore(REMINDER_INTERVAL_DAYS - 1), NOW), false);
});

test('once the interval has passed it is raised again', () => {
  assert.equal(shouldRemind(daysBefore(REMINDER_INTERVAL_DAYS), NOW), true);
  assert.equal(shouldRemind(daysBefore(REMINDER_INTERVAL_DAYS + 30), NOW), true);
});

test('the interval is long enough not to become noise', () => {
  // A daily nag is the one outcome that would make this worse than silence.
  assert.ok(REMINDER_INTERVAL_DAYS >= 7);
});
