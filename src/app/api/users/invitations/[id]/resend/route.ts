import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { resendInvitation } from '@/server/modules/users/users.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Administrator-only and audited, so it is not rate limited. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAdmin(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await resendInvitation(id, ctx));
  });
}
