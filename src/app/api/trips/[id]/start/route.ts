import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { startTripSchema } from '@/server/modules/trips/trips.validation';
import { startTrip } from '@/server/modules/trips/trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A driver may start their own trip; ownership is checked in the service. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, startTripSchema);
    const trip = await startTrip(id, input, ctx);
    return ok({ trip: trip.toJSON() });
  });
}
