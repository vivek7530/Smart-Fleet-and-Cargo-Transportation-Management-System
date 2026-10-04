import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { listQuerySchema } from '@/server/lib/pagination';
import { idParamSchema } from '@/server/modules/shared';
import { getUserActivity } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The audit trail for one user — powers the manager/driver activity views. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await getUserActivity(id, parseQuery(request, listQuerySchema)));
  });
}
