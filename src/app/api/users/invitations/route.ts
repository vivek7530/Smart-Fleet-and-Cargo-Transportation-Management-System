import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { listInvitationsQuerySchema } from '@/server/modules/users/users.validation';
import { listInvitations } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAdmin(request);
    return ok(await listInvitations(parseQuery(request, listInvitationsQuerySchema)));
  });
}
