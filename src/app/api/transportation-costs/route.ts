import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import {
  createCostSchema,
  createTransportationCost,
  listCostsQuerySchema,
  listTransportationCosts,
} from '@/server/modules/transportation-costs/transportationCosts.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Transportation costs are a back-office ledger — never exposed to drivers.
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    return ok(await listTransportationCosts(parseQuery(request, listCostsQuerySchema)));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, createCostSchema);
    const record = await createTransportationCost(input, ctx);
    return created({ transportationCost: record.toJSON() });
  });
}
