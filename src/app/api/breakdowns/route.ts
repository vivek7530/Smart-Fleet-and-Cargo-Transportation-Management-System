import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import {
  createBreakdown,
  createBreakdownSchema,
  listBreakdowns,
  listBreakdownsQuerySchema,
} from '@/server/modules/breakdowns/breakdowns.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await listBreakdowns(parseQuery(request, listBreakdownsQuerySchema), ctx));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, createBreakdownSchema);
    const report = await createBreakdown(input, ctx);
    return created({ breakdown: report.toJSON() });
  });
}
