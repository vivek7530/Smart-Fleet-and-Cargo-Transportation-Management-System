import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import {
  buildLeaderboards,
  financialsForPeriods,
  pickGranularity,
  rangeQuerySchema,
  resolveRange,
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

    const [financialPeriods, leaderboards] = await Promise.all([
      financialsForPeriods(range, undefined, granularity),
      buildLeaderboards(range),
    ]);

    return ok({
      range,
      granularity,
      totals: financialPeriods.current,
      previousTotals: financialPeriods.previous,
      series: financialPeriods.series ?? [],
      ...leaderboards,
    });
  });
}
