import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { updateCargoSchema } from '@/server/modules/cargo/cargo.validation';
import { deleteCargo, getCargo, updateCargo } from '@/server/modules/cargo/cargo.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok({ cargo: (await getCargo(id)).toJSON() });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateCargoSchema);
    const cargo = await updateCargo(id, input, ctx);
    return ok({ cargo: cargo.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteCargo(id, ctx));
  });
}
