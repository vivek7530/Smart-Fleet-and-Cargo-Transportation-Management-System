import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth, requireStaff } from '@/server/api/context';
import { createTripSchema, listTripsQuerySchema } from '@/server/modules/trips/trips.validation';
import { createTrip, listTrips } from '@/server/modules/trips/trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    // Drivers are scoped to their own trips inside the service.
    const ctx = await requireAuth(request);
    return ok(await listTrips(parseQuery(request, listTripsQuerySchema), ctx.user));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, createTripSchema);
    const trip = await createTrip(input as never, ctx);
    return created({ trip: trip.toJSON() });
  });
}
