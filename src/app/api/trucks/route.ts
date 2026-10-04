import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { createTruckSchema, listTrucksQuerySchema } from '@/server/modules/trucks/trucks.validation';
import { createTruck, listTrucks } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    return ok(await listTrucks(parseQuery(request, listTrucksQuerySchema)));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, createTruckSchema);
    const truck = await createTruck(input, ctx);
    return created({ truck: truck.toJSON() });
  });
}
