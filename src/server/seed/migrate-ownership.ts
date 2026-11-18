/**
 * One-off migration: give every truck an owning manager, every trip the owner
 * of its truck, and every driver the manager whose truck they drive.
 *
 *   npm run migrate:ownership            → report what would change, change nothing
 *   npm run migrate:ownership -- --apply → write the changes
 *
 * It is idempotent: a second run finds nothing left to do. Running it with no
 * flag is always safe, and is the intended first step — read the summary, then
 * re-run with `--apply`.
 *
 * The guiding rule is **never guess an owner**. Where the existing data does not
 * say clearly who is responsible for a truck, the truck is left unowned so an
 * administrator sees it as a red flag and assigns it deliberately. A wrong owner
 * is worse than no owner: it silently hands one manager another's fleet.
 */
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../db';
import { logger } from '../lib/logger';
import { User } from '../models/User';
import { Truck } from '../models/Truck';
import { Trip } from '../models/Trip';
import { TERMINAL_TRIP_STATUSES } from '../types/enums';

const APPLY = process.argv.includes('--apply');

interface Summary {
  trucksAssigned: number;
  trucksRedFlagged: number;
  tripsOwned: number;
  tripsInherited: number;
  tripsUnowned: number;
  driversAssigned: number;
  driversRedFlagged: number;
  conflicts: string[];
  indexDropped: boolean;
  nameKeysCleared: number;
}

async function migrate(): Promise<Summary> {
  const summary: Summary = {
    trucksAssigned: 0,
    trucksRedFlagged: 0,
    tripsOwned: 0,
    tripsInherited: 0,
    tripsUnowned: 0,
    driversAssigned: 0,
    driversRedFlagged: 0,
    conflicts: [],
    indexDropped: false,
    nameKeysCleared: 0,
  };

  // Managers who can actually take responsibility for something today. An
  // archived or suspended manager is not a valid owner, so a truck created by
  // one falls through to the red-flag list rather than to a dead account.
  const activeManagers = await User.find({ role: 'MANAGER', status: 'ACTIVE' }).select('_id name').lean();
  const managerIds = new Set(activeManagers.map((manager) => String(manager._id)));

  // -------------------------------------------------------------------------
  // 1. Drop the old global driver-name index.
  //
  // A driver's identity is the email or mobile they were invited on, both of
  // which are already unique. Names are free to repeat — two managers may each
  // employ a "Ramesh Yadav".
  // -------------------------------------------------------------------------
  const indexes = await User.collection.indexes();
  if (indexes.some((index) => index.name === 'unique_driver_name_key')) {
    if (APPLY) await User.collection.dropIndex('unique_driver_name_key');
    summary.indexDropped = true;
  }
  // Counted through the raw collection, not the model: `nameKey` is no longer in
  // the schema, and Mongoose silently drops filters on unknown fields in strict
  // mode — which would turn this into `countDocuments({})` and report every user
  // as stale forever.
  const staleNameKeys = await User.collection.countDocuments({ nameKey: { $exists: true } });
  if (staleNameKeys > 0) {
    if (APPLY) await User.collection.updateMany({ nameKey: { $exists: true } }, { $unset: { nameKey: '' } });
    summary.nameKeysCleared = staleNameKeys;
  }

  // -------------------------------------------------------------------------
  // 2. Trucks — promote `createdBy` to `owner`, but only when it points at a
  //    manager who is still active. Anything else is a red flag.
  // -------------------------------------------------------------------------
  const trucks = await Truck.find({ owner: null }).select('_id truckNumber createdBy purchaseDate createdAt');
  for (const truck of trucks) {
    const creator = truck.createdBy ? String(truck.createdBy) : null;
    if (creator && managerIds.has(creator)) {
      if (APPLY) {
        await Truck.updateOne(
          { _id: truck._id },
          {
            owner: truck.createdBy,
            ownerHistory: [{ owner: truck.createdBy, from: truck.purchaseDate ?? truck.createdAt, to: null }],
          },
        );
      }
      summary.trucksAssigned += 1;
    } else {
      summary.trucksRedFlagged += 1;
      summary.conflicts.push(
        `Truck ${truck.truckNumber}: ${creator ? 'created by a user who is not an active manager' : 'no creator recorded'} — left unowned`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. Trips — the owner comes from the TRUCK, not from `createdBy`. The truck
  //    is the root of ownership, so where the two disagree the truck wins.
  //
  //    Where a finished trip was created by a different active manager, that
  //    manager earned the money: stamp `inheritedFrom` so the figures stay with
  //    them and do not inflate the current owner's reports.
  // -------------------------------------------------------------------------
  const ownerByTruck = new Map<string, string>();
  for (const truck of await Truck.find({ owner: { $ne: null } }).select('_id owner').lean()) {
    ownerByTruck.set(String(truck._id), String(truck.owner));
  }

  const trips = await Trip.find({ owner: null }).select('_id tripCode truck createdBy status');
  for (const trip of trips) {
    const owner = trip.truck ? ownerByTruck.get(String(trip.truck)) : undefined;
    if (!owner) {
      summary.tripsUnowned += 1;
      continue;
    }

    const creator = trip.createdBy ? String(trip.createdBy) : null;
    const finished = TERMINAL_TRIP_STATUSES.includes(trip.status);
    const earnedByAnother = finished && creator !== null && creator !== owner && managerIds.has(creator);

    if (APPLY) {
      await Trip.updateOne(
        { _id: trip._id },
        { owner, ...(earnedByAnother ? { inheritedFrom: trip.createdBy } : {}) },
      );
    }
    summary.tripsOwned += 1;
    if (earnedByAnother) summary.tripsInherited += 1;
  }

  // -------------------------------------------------------------------------
  // 4. Drivers — the manager of the truck they drive.
  //
  //    `invitedBy` is deliberately NOT used as a fallback: it records who sent
  //    the invitation years ago, which says nothing about who is responsible for
  //    the driver now. Guessing from it would produce confident nonsense.
  // -------------------------------------------------------------------------
  const drivers = await User.find({ role: 'DRIVER', manager: null }).select('_id name');
  for (const driver of drivers) {
    const truck = await Truck.findOne({ assignedDriver: driver._id }).select('owner truckNumber').lean();
    const owner = truck?.owner ? String(truck.owner) : null;

    if (owner && managerIds.has(owner)) {
      if (APPLY) await User.updateOne({ _id: driver._id }, { manager: truck!.owner });
      summary.driversAssigned += 1;
    } else {
      summary.driversRedFlagged += 1;
      summary.conflicts.push(
        `Driver ${driver.name}: ${truck ? `truck ${truck.truckNumber} has no owner` : 'not assigned to a truck'} — left unassigned`,
      );
    }
  }

  return summary;
}

function report(summary: Summary): void {
  const line = '─'.repeat(72);
  console.log(`\n${line}`);
  console.log(APPLY ? '  Ownership migration — APPLIED' : '  Ownership migration — DRY RUN (nothing was written)');
  console.log(line);
  console.log(`  Trucks given an owner        ${summary.trucksAssigned}`);
  console.log(`  Trucks left unowned  🚩      ${summary.trucksRedFlagged}`);
  console.log(`  Trips given an owner         ${summary.tripsOwned}`);
  console.log(`    …of those, inherited       ${summary.tripsInherited}  (figures stay with the earlier manager)`);
  console.log(`  Trips still unowned          ${summary.tripsUnowned}  (their truck has no owner yet)`);
  console.log(`  Drivers given a manager      ${summary.driversAssigned}`);
  console.log(`  Drivers left unassigned 🚩   ${summary.driversRedFlagged}`);
  const willBe = APPLY ? '' : 'to be ';
  console.log(`  Old driver-name index        ${summary.indexDropped ? `${willBe}dropped` : 'not present'}`);
  console.log(`  Stale nameKey fields         ${summary.nameKeysCleared} ${willBe}cleared`);

  if (summary.conflicts.length > 0) {
    console.log(`\n  ${summary.conflicts.length} thing(s) an administrator has to decide:`);
    for (const conflict of summary.conflicts.slice(0, 40)) console.log(`    · ${conflict}`);
    if (summary.conflicts.length > 40) console.log(`    · …and ${summary.conflicts.length - 40} more`);
    console.log('\n  These are not failures. Nothing was guessed, so an administrator');
    console.log('  assigns them from Fleet Allocation and the red flags clear.');
  }

  if (!APPLY) {
    console.log('\n  Re-run with --apply to write these changes:');
    console.log('    npm run migrate:ownership -- --apply');
  }
  console.log(`${line}\n`);
}

connectToDatabase()
  .then(migrate)
  .then(async (summary) => {
    report(summary);
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Ownership migration failed', error);
    await mongoose.connection.close().catch(() => undefined);
    process.exit(1);
  });
