import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import {
  updateBreakdownStatus,
  updateBreakdownStatusSchema,
} from '@/server/modules/breakdowns/breakdowns.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Managers acknowledge, progress and resolve the reports drivers file. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateBreakdownStatusSchema);
    const report = await updateBreakdownStatus(id, input, ctx);
    return ok({ breakdown: report.toJSON() });
  });
}
