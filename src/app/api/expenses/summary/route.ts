import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { expenseSummary } from '@/server/modules/expenses/expenses.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Summary strip shown on both the driver and manager expense screens. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await expenseSummary(ctx));
  });
}
