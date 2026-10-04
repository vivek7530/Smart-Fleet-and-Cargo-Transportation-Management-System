import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { unreadCount } from '@/server/modules/notifications/notifications.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await unreadCount(ctx));
  });
}
