import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { markNotificationRead } from '@/server/modules/notifications/notifications.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const notification = await markNotificationRead(id, ctx);
    return ok({ notification: notification.toJSON() });
  });
}
