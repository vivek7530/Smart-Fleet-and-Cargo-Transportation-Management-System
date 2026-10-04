import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { completeTripSchema } from '@/server/modules/trips/trips.validation';
import { completeTrip } from '@/server/modules/trips/trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Closing the books is a back-office action, never a driver's. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, completeTripSchema);
    const trip = await completeTrip(id, input, ctx);
    return ok({ trip: trip.toJSON() });
  });
}
