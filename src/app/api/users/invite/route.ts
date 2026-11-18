import { type NextRequest } from 'next/server';
import { created, handle, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { inviteUserSchema } from '@/server/modules/users/users.validation';
import { inviteUser } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Not rate limited: this is a staff action that is already authenticated and
 * audited, and onboarding a whole fleet in one sitting is normal use.
 *
 * A manager reaches this route too, but `inviteUser` narrows them to drivers on
 * their own roster — the role check cannot live here, because it depends on the
 * body as well as the caller.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, inviteUserSchema);
    return created(await inviteUser(input, ctx));
  });
}
