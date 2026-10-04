import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { clearAuthCookie } from '@/server/lib/jwt';
import { recordAudit } from '@/server/services/audit.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handle(async () => {
    const response = ok({ message: 'Signed out' });
    clearAuthCookie(response);

    // Signing out must succeed even if the session was already invalid.
    await requireAuth(request)
      .then((ctx) =>
        recordAudit({
          ctx,
          action: 'USER_LOGOUT',
          summary: `${ctx.user.name} signed out`,
          entity: 'User',
          entityId: ctx.user._id,
        }),
      )
      .catch(() => undefined);

    return response;
  });
}
