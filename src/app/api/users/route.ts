import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { listUsersQuerySchema } from '@/server/modules/users/users.validation';
import { listUsers, scopeUserListForRole } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const query = parseQuery(request, listUsersQuerySchema);
    // Managers are narrowed to drivers server-side, never by the client.
    return ok(await listUsers(scopeUserListForRole(ctx.user.role, query) as never));
  });
}
