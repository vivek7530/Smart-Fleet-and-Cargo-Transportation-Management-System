import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { listAuditLogs, listAuditQuerySchema } from '@/server/modules/notifications/notifications.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The audit trail is an administrator-only view.
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAdmin(request);
    return ok(await listAuditLogs(parseQuery(request, listAuditQuerySchema)));
  });
}
