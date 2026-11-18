import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { financialsByManager, rangeQuerySchema, resolveRange } from '@/server/services/reports.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Revenue, cost and profit split by the manager who held the truck.
 *
 * Administrators only: it is the one report that deliberately crosses every
 * ownership boundary at once, which is the whole reason it exists.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAdmin(request);
    const query = parseQuery(request, rangeQuerySchema);
    return ok({ rows: await financialsByManager(resolveRange(query.preset, query.from, query.to)) });
  });
}
