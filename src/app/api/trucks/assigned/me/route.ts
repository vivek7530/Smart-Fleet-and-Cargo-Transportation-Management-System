import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { getAssignedTruckFor } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The single truck the signed-in driver is responsible for. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await getAssignedTruckFor(String(ctx.user._id)));
  });
}
