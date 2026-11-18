import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanEdit,
  assertCanSee,
  canAccess,
  canSeeFinancials,
  omitFields,
  ownerScopeFor,
  permissionFor,
  redactTripFor,
  refId,
  TRIP_FINANCIAL_FIELDS,
  type ActorLike,
  type OwnedLike,
} from './ownership';

const ADMIN: ActorLike = { _id: 'admin-1', role: 'ADMIN' };
const ALICE: ActorLike = { _id: 'mgr-alice', role: 'MANAGER' };
const BOB: ActorLike = { _id: 'mgr-bob', role: 'MANAGER' };

const aliceTruck: OwnedLike = { owner: 'mgr-alice', sharedWith: [] };
const unowned: OwnedLike = { owner: null, sharedWith: [] };
const sharedView: OwnedLike = {
  owner: 'mgr-alice',
  sharedWith: [{ user: 'mgr-bob', permission: 'VIEW' }],
};
const sharedEdit: OwnedLike = {
  owner: 'mgr-alice',
  sharedWith: [{ user: 'mgr-bob', permission: 'EDIT' }],
};

test('refId reads both raw and populated refs, and distinguishes absent', () => {
  assert.equal(refId('abc'), 'abc');
  assert.equal(refId({ _id: 'abc', name: 'Priya' }), 'abc');
  assert.equal(refId(null), null);
  assert.equal(refId(undefined), null);
  // Two unowned documents must never be treated as matching each other.
  assert.notEqual(refId(null), refId(null) ?? 'x');
});

test('an owner holds EDIT, a sharee holds what they were given, a stranger holds nothing', () => {
  assert.equal(permissionFor(aliceTruck, ALICE), 'EDIT');
  assert.equal(permissionFor(sharedView, BOB), 'VIEW');
  assert.equal(permissionFor(sharedEdit, BOB), 'EDIT');
  assert.equal(permissionFor(aliceTruck, BOB), null);
});

test('an administrator reaches everything, including an unowned truck', () => {
  assert.equal(canAccess(aliceTruck, ADMIN, 'EDIT'), true);
  assert.equal(canAccess(unowned, ADMIN, 'EDIT'), true);
  assert.deepEqual(ownerScopeFor(ADMIN), {});
  assert.deepEqual(ownerScopeFor(ADMIN, 'EDIT'), {});
});

test('an unowned truck belongs to no manager and is never claimed by one', () => {
  assert.equal(canAccess(unowned, ALICE), false);
  assert.equal(canAccess(unowned, BOB), false);
  // The owner-null case must not match a manager whose id is also absent.
  assert.equal(canAccess(unowned, { _id: null, role: 'MANAGER' }), false);
});

test('VIEW lets a sharee look but not change', () => {
  assert.equal(canAccess(sharedView, BOB, 'VIEW'), true);
  assert.equal(canAccess(sharedView, BOB, 'EDIT'), false);
  assert.equal(canAccess(sharedEdit, BOB, 'EDIT'), true);
});

test('the list scope matches owned and shared, and narrows for EDIT', () => {
  assert.deepEqual(ownerScopeFor(ALICE), {
    $or: [
      { owner: 'mgr-alice' },
      { sharedWith: { $elemMatch: { user: 'mgr-alice' } } },
    ],
  });
  assert.deepEqual(ownerScopeFor(ALICE, 'EDIT'), {
    $or: [
      { owner: 'mgr-alice' },
      { sharedWith: { $elemMatch: { user: 'mgr-alice', permission: 'EDIT' } } },
    ],
  });
});

test('"not yours" is reported as "does not exist", so ids cannot be probed', () => {
  assert.throws(
    () => assertCanSee(aliceTruck, BOB, 'truck'),
    (error: { status?: number; message?: string }) => {
      assert.equal(error.status, 404);
      assert.match(String(error.message), /could not be found/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertCanSee(aliceTruck, ALICE, 'truck'));
  assert.doesNotThrow(() => assertCanSee(aliceTruck, ADMIN, 'truck'));
});

test('a VIEW sharee is told the record exists but is not theirs to change', () => {
  assert.throws(
    () => assertCanEdit(sharedView, BOB, 'trip'),
    (error: { status?: number }) => {
      assert.equal(error.status, 403);
      return true;
    },
  );
  // A stranger still gets 404 — 403 would confirm the record exists.
  assert.throws(
    () => assertCanEdit(aliceTruck, BOB, 'trip'),
    (error: { status?: number }) => {
      assert.equal(error.status, 404);
      return true;
    },
  );
  assert.doesNotThrow(() => assertCanEdit(sharedEdit, BOB, 'trip'));
});

test('money is hidden from a VIEW sharee and shown to the owner', () => {
  assert.equal(canSeeFinancials(aliceTruck, ALICE), true);
  assert.equal(canSeeFinancials(sharedView, BOB), false);
  assert.equal(canSeeFinancials(sharedEdit, BOB), true);
  assert.equal(canSeeFinancials(aliceTruck, BOB), false);
});

test('an inherited trip keeps its money with whoever earned it', () => {
  const inherited: OwnedLike = {
    owner: 'mgr-bob',
    sharedWith: [],
    inheritedFrom: 'mgr-alice',
  };
  // Bob now holds the truck, but this trip was finished and paid for by Alice.
  assert.equal(canAccess(inherited, BOB, 'EDIT'), true, 'Bob still sees the trip');
  assert.equal(canSeeFinancials(inherited, BOB), false, 'but not its figures');
  // The administrator keeps the complete picture — that is what makes the
  // handover reports trustworthy.
  assert.equal(canSeeFinancials(inherited, ADMIN), true);
});

test('redaction strips the figures from the payload, not just the screen', () => {
  const payload = {
    tripCode: 'TRP-0142',
    revenue: 50_000,
    profit: 12_000,
    fuelCost: 8_000,
    transportationCost: 20_000,
    driverExpenseTotal: 10_000,
    totalExpenses: 38_000,
    pickupLocation: 'Surat',
  };

  const forOwner = redactTripFor(payload, aliceTruck, ALICE);
  assert.equal(forOwner.revenue, 50_000);
  assert.equal(forOwner.canSeeFinancials, true);

  const forSharee = redactTripFor(payload, sharedView, BOB);
  assert.equal(forSharee.canSeeFinancials, false);
  assert.equal(forSharee.pickupLocation, 'Surat', 'operational detail survives');
  for (const field of TRIP_FINANCIAL_FIELDS) {
    assert.equal(field in forSharee, false, `${field} must be absent, not zero`);
  }
});

test('omitFields copies rather than mutating the source', () => {
  const source = { a: 1, b: 2 };
  const stripped = omitFields(source, ['b']);
  assert.deepEqual(stripped, { a: 1 });
  assert.deepEqual(source, { a: 1, b: 2 });
});
