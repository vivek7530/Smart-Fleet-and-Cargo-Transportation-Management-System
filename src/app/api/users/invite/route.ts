import { type NextRequest } from 'next/server';
import { created, handle, parseBody } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { inviteUserSchema } from '@/server/modules/users/users.validation';
import { inviteUser } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Not rate limited: this is an administrator-only action that is already
 * authenticated and audited, and onboarding a whole fleet in one sitting is
 * normal use.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const input = await parseBody(request, inviteUserSchema);
    return created(await inviteUser(input, ctx));
  });
}
