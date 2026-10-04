import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { updateTruckSchema } from '@/server/modules/trucks/trucks.validation';
import { deleteTruck, getTruck, updateTruck } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await getTruck(id));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateTruckSchema);
    const truck = await updateTruck(id, input, ctx);
    return ok({ truck: truck.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteTruck(id, ctx));
  });
}
