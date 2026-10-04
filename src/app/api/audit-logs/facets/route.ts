import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { auditFacets } from '@/server/modules/notifications/notifications.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Distinct entities and actions, used to populate the filter dropdowns. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAdmin(request);
    return ok(await auditFacets());
  });
}
