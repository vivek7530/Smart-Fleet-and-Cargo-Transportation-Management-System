import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { withFailureLimit } from '@/server/api/rate-limit';
import { requireAuth } from '@/server/api/context';
import { ApiError } from '@/server/lib/ApiError';
import { changePasswordSchema } from '@/server/modules/auth/auth.validation';
import { changePassword } from '@/server/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, changePasswordSchema);

    // Only a wrong current password counts — a successful change costs nothing.
    await withFailureLimit(request, () => changePassword(ctx.user, input.currentPassword, input.newPassword, ctx), {
      shouldCount: (error) =>
        error instanceof ApiError && error.message === 'Your current password is incorrect',
    });

    return ok({ message: 'Your password has been updated' });
  });
}
