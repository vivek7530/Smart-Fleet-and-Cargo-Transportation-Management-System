import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { transferTruckSchema } from '@/server/modules/trucks/trucks.validation';
import { transferTruck } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hands a truck to another manager, carrying its unfinished trips with it.
 *
 * Separate from PATCH because it is not a field edit: ownership history, the
 * trips and the driver all move together, and only an administrator decides it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, transferTruckSchema);
    const result = await transferTruck(id, input, ctx);
    return ok({ ...result, truck: result.truck.toJSON() });
  });
}
