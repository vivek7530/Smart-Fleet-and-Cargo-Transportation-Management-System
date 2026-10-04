import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import {
  listNotifications,
  listNotificationsQuerySchema,
} from '@/server/modules/notifications/notifications.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await listNotifications(parseQuery(request, listNotificationsQuerySchema), ctx));
  });
}
