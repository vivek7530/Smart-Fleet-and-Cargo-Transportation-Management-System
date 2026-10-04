import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { createFuelSchema, listFuelQuerySchema } from '@/server/modules/fuel/fuel.service';
import { createFuelRecord, listFuel } from '@/server/modules/fuel/fuel.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await listFuel(parseQuery(request, listFuelQuerySchema), ctx));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, createFuelSchema);
    const record = await createFuelRecord(input, ctx);
    return created({ fuelRecord: record.toJSON() });
  });
}
