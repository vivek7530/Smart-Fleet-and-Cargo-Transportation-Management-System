import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { getMyFleet } from '@/server/modules/managers/managers.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in manager's own fleet: their trucks, their drivers, their live
 * trips. The caller is the scope — there is no id to pass, so this route can
 * never be pointed at another manager's roster.
 *
 * An administrator reaching it gets the whole company, which is what
 * `ownerScopeFor` returns for them; the admin view of the same question, split
 * per manager, is `/api/trucks/by-manager`.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    return ok(await getMyFleet(ctx.user));
  });
}
