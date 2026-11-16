import { connectToDatabase, disconnectFromDatabase } from '../src/server/db';
import { FuelRecord } from '../src/server/models/FuelRecord';
import { Trip } from '../src/server/models/Trip';

async function main() {
  await connectToDatabase();

  await Promise.all([
    Trip.collection.createIndex(
      { status: 1, completedAt: 1 },
      {
        name: 'status_1_completedAt_1',
        partialFilterExpression: { status: 'COMPLETED' },
      },
    ),
    Trip.collection.createIndex(
      { driver: 1, status: 1, completedAt: 1 },
      {
        name: 'driver_1_status_1_completedAt_1',
        partialFilterExpression: { status: 'COMPLETED' },
      },
    ),
    FuelRecord.collection.createIndex({ driver: 1, date: -1 }, { name: 'driver_1_date_-1' }),
  ]);

  process.stdout.write('Performance indexes are ready.\n');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Could not create performance indexes: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(disconnectFromDatabase);
