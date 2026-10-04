import { type NextRequest } from 'next/server';
import { connectToDatabase } from '@/server/db';
import { handle, ok, parseBody } from '@/server/api/respond';
import { withFailureLimit } from '@/server/api/rate-limit';
import { requestMeta } from '@/server/api/context';
import { setAuthCookie, signAuthToken } from '@/server/lib/jwt';
import { registerSchema } from '@/server/modules/auth/auth.validation';
import { registerFromInvitation, toSessionUser } from '@/server/modules/auth/auth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handle(async () => {
    await connectToDatabase();
    const input = await parseBody(request, registerSchema);

    // Only a rejected token counts, so someone completing their registration —
    // even after a couple of typos — is never blocked.
    const user = await withFailureLimit(request, () =>
      registerFromInvitation(input, requestMeta(request)),
    );

    // Completing registration signs the new user straight in.
    const response = ok({ user: toSessionUser(user) }, 201);
    setAuthCookie(response, signAuthToken({ sub: String(user._id), role: user.role }));
    return response;
  });
}
