import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { changeStatusSchema } from '@/server/modules/trips/trips.validation';
import { changeTripStatus } from '@/server/modules/trips/trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const { status, note } = await parseBody(request, changeStatusSchema);
    const trip = await changeTripStatus(id, status, note, ctx);
    return ok({ trip: trip.toJSON() });
  });
}
