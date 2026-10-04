import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAdmin, requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { updateUserSchema } from '@/server/modules/users/users.validation';
import { deleteUser, getUserById, getUserStats, updateUser } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const user = await getUserById(id, ctx.user.role);
    return ok({ user: user.toJSON(), stats: await getUserStats(user) });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateUserSchema);
    const user = await updateUser(id, input, ctx);
    return ok({ user: user.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteUser(id, ctx));
  });
}
