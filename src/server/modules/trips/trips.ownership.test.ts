import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerAt, tripScopeFor } from './trips.service';
import type { UserDocument } from '../../models/User';

// Only the two fields the scope actually reads; casting keeps the test free of
// a full Mongoose document.
const asUser = (id: string, role: string) => ({ _id: id, role }) as unknown as UserDocument;

test('a driver sees only the trips assigned to them, whoever owns the truck', () => {
  assert.deepEqual(tripScopeFor(asUser('driver-1', 'DRIVER')), { driver: 'driver-1' });
});

test('a manager sees the trips they own or were shared, and an admin sees all', () => {
  assert.deepEqual(tripScopeFor(asUser('mgr-alice', 'MANAGER')), {
    $or: [
      { owner: 'mgr-alice' },
      { sharedWith: { $elemMatch: { user: 'mgr-alice' } } },
    ],
  });
  assert.deepEqual(tripScopeFor(asUser('admin-1', 'ADMIN')), {});
});

test('ownerAt finds who held the truck on the day a historical trip finished', () => {
  const history = [
    { owner: 'mgr-alice', from: new Date('2024-01-01'), to: new Date('2024-06-30') },
    { owner: 'mgr-bob', from: new Date('2024-07-01'), to: null },
  ];

  assert.equal(ownerAt(history, new Date('2024-03-15')), 'mgr-alice');
  assert.equal(ownerAt(history, new Date('2024-09-15')), 'mgr-bob');
  // An open-ended period runs to today, not to its start date.
  assert.equal(ownerAt(history, new Date('2030-01-01')), 'mgr-bob');
});

test('ownerAt says "unknown" rather than guessing, and never says "nobody"', () => {
  const history = [{ owner: 'mgr-bob', from: new Date('2024-07-01'), to: null }];

  // Before the truck was ever assigned: we genuinely do not know who ran it,
  // so the caller must leave the money where it is instead of attributing it.
  assert.equal(ownerAt(history, new Date('2024-01-01')), null);
  assert.equal(ownerAt([], new Date('2024-01-01')), null);
  assert.equal(ownerAt(undefined, new Date('2024-01-01')), null);
});

test('a boundary day belongs to the period that was open on it', () => {
  const history = [
    { owner: 'mgr-alice', from: new Date('2024-01-01'), to: new Date('2024-06-30') },
    { owner: 'mgr-bob', from: new Date('2024-07-01'), to: null },
  ];

  assert.equal(ownerAt(history, new Date('2024-01-01')), 'mgr-alice', 'the first day counts');
  assert.equal(ownerAt(history, new Date('2024-06-30')), 'mgr-alice', 'the last day counts');
  assert.equal(ownerAt(history, new Date('2024-07-01')), 'mgr-bob');
});
