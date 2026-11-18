import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import {
  financialsFor,
  pickGranularity,
  rangeQuerySchema,
  resolveRange,
  reportScopeFor,
  timeSeries,
} from '@/server/services/reports.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const query = parseQuery(request, rangeQuerySchema);
    const range = resolveRange(query.preset, query.from, query.to);
    const granularity = pickGranularity(range, query.granularity);

    // A driver's analytics are limited to their own activity.
    const driverId = ctx.user.role === 'DRIVER' ? String(ctx.user._id) : undefined;
    // A manager's analytics cover their own fleet, not the company's.
    const scope = await reportScopeFor(ctx.user);

    const [series, totals] = await Promise.all([
      timeSeries(range, granularity, driverId, scope),
      financialsFor(range, driverId, scope),
    ]);

    return ok({ range, granularity, series, totals });
  });
}
