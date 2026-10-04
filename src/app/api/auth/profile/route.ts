import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { updateProfileSchema } from '@/server/modules/auth/auth.validation';
import { toSessionUser, updateOwnProfile } from '@/server/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, updateProfileSchema);
    const user = await updateOwnProfile(ctx.user, input, ctx);
    return ok({ user: toSessionUser(user) });
  });
}
