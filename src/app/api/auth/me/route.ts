import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { toSessionUser } from '@/server/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok({ user: toSessionUser(ctx.user) });
  });
}
