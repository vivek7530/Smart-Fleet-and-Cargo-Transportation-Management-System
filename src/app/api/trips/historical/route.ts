import { handle, created, parseBody } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { createHistoricalTrip } from '@/server/modules/trips/trips.service';
import { historicalTripSchema } from '@/server/modules/trips/trips.validation';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const input = await parseBody(request, historicalTripSchema);
    return created({ trip: await createHistoricalTrip(input, ctx) });
  });
}
