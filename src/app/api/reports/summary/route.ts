import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import {
  buildLeaderboards,
  financialsFor,
  pickGranularity,
  previousRange,
  rangeQuerySchema,
  resolveRange,
  timeSeries,
} from '@/server/services/reports.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Full report page — leaderboards and the expense breakdown are staff only. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    const query = parseQuery(request, rangeQuerySchema);
    const range = resolveRange(query.preset, query.from, query.to);
    const granularity = pickGranularity(range, query.granularity);

    const [totals, previousTotals, series, leaderboards] = await Promise.all([
      financialsFor(range),
      financialsFor(previousRange(range)),
      timeSeries(range, granularity),
      buildLeaderboards(range),
    ]);

    return ok({ range, granularity, totals, previousTotals, series, ...leaderboards });
  });
}
