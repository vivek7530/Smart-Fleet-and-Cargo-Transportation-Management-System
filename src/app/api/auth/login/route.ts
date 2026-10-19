import { after, type NextRequest } from 'next/server';
import { connectToDatabase } from '@/server/db';
import { handle, ok, parseBody } from '@/server/api/respond';
import { withFailureLimit } from '@/server/api/rate-limit';
import { requestMeta } from '@/server/api/context';
import { setAuthCookie, signAuthToken } from '@/server/lib/jwt';
import { loginSchema } from '@/server/modules/auth/auth.validation';
import { authenticate, toSessionUser } from '@/server/modules/auth/auth.service';
import { recordAudit } from '@/server/services/audit.service';
import { User } from '@/server/models/User';
import { hashPassword, needsRehash } from '@/server/lib/password';
import { logger } from '@/server/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handle(async () => {
    await connectToDatabase();
    const input = await parseBody(request, loginSchema);

    // Only a rejected sign-in counts towards the window; a correct one is free,
    // so a legitimate user can never be locked out.
    const user = await withFailureLimit(request, () => authenticate(input));

    const response = ok({ user: toSessionUser(user) });
    setAuthCookie(response, signAuthToken({ sub: String(user._id), role: user.role }));

    // Bookkeeping runs after the response is on its way, so the user is never
    // kept waiting on writes they do not need to see.
    const meta = requestMeta(request);
    const plainPassword = input.password;
    after(async () => {
      try {
        const update: Record<string, unknown> = { lastLoginAt: user.lastLoginAt };
        if (user.passwordHash && needsRehash(user.passwordHash)) {
          update.passwordHash = await hashPassword(plainPassword);
        }
        await Promise.all([
          User.updateOne({ _id: user._id }, { $set: update }),
          recordAudit({
            ctx: { user, ...meta },
            action: 'USER_LOGIN',
            summary: `${user.name} signed in`,
            entity: 'User',
            entityId: user._id,
          }),
        ]);
      } catch (error) {
        logger.error('Post-login bookkeeping failed', error);
      }
    });

    return response;
  });
}
