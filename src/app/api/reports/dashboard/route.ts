import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { buildDashboard, rangeQuerySchema, resolveRange } from '@/server/services/reports.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const query = parseQuery(request, rangeQuerySchema);
    // The service returns a driver-shaped payload for drivers.
    return ok(await buildDashboard(ctx.user, resolveRange(query.preset, query.from, query.to)));
  });
}
