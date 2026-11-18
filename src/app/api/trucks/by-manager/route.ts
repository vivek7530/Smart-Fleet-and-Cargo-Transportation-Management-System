import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { listFleetByManager } from '@/server/modules/trucks/trucks.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The whole fleet grouped by the manager who holds each truck.
 *
 * Administrators only. This is the one view that deliberately crosses every
 * ownership boundary at once, which is why it never goes through the
 * manager-scoped truck list.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAdmin(request);
    return ok(await listFleetByManager());
  });
}
