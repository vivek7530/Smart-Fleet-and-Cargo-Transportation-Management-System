import { type NextRequest } from 'next/server';
import { handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { idParamSchema, objectId } from '@/server/modules/shared';
import { z } from 'zod';
import { shareTruckSchema } from '@/server/modules/trucks/trucks.validation';
import { shareTruck, unshareTruck } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Grants a manager access to this truck, or changes the access they have. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, shareTruckSchema);
    const truck = await shareTruck(id, input, ctx);
    return ok({ truck: truck.toJSON() });
  });
}

/** Takes that access back. The manager who owns the truck is unaffected. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    const { user } = parseQuery(request, z.object({ user: objectId }));
    const truck = await unshareTruck(id, user, ctx);
    return ok({ truck: truck.toJSON() });
  });
}
