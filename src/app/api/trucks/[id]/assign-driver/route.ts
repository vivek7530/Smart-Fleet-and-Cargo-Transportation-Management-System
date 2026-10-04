import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { assignDriverSchema } from '@/server/modules/trucks/trucks.validation';
import { assignDriver } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const { driverId } = await parseBody(request, assignDriverSchema);
    const truck = await assignDriver(id, driverId, ctx);
    return ok({ truck: truck.toJSON() });
  });
}
