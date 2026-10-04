import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { createCargoSchema, listCargoQuerySchema } from '@/server/modules/cargo/cargo.validation';
import { createCargo, listCargo } from '@/server/modules/cargo/cargo.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cargo is a back-office concern — drivers see it through their trip.
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    return ok(await listCargo(parseQuery(request, listCargoQuerySchema)));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, createCargoSchema);
    const cargo = await createCargo(input, ctx);
    return created({ cargo: cargo.toJSON() });
  });
}
