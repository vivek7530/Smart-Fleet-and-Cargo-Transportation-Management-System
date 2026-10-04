import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth, requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { updateTripSchema } from '@/server/modules/trips/trips.validation';
import { deleteTrip, getTrip, updateTrip } from '@/server/modules/trips/trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await getTrip(id, ctx.user));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateTripSchema);
    const trip = await updateTrip(id, input, ctx);
    return ok({ trip: trip.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteTrip(id, ctx));
  });
}
