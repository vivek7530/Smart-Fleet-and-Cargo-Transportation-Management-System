import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { getBreakdown } from '@/server/modules/breakdowns/breakdowns.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return ok({ breakdown: (await getBreakdown(id, ctx)).toJSON() });
  });
}
