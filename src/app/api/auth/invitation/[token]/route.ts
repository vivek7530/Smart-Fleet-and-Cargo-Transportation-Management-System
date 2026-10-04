import { type NextRequest } from 'next/server';
import { connectToDatabase } from '@/server/db';
import { handle, ok } from '@/server/api/respond';
import { withFailureLimit } from '@/server/api/rate-limit';
import { invitationSummary, resolveInvitation } from '@/server/services/invitation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public — the registration page uses this to pre-fill and lock the invited contact. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    await connectToDatabase();
    const { token } = await params;

    // A valid link resolves freely; only unknown tokens count, which is what
    // makes guessing a token impractical.
    const invitation = await withFailureLimit(request, () => resolveInvitation(token));
    return ok({ invitation: invitationSummary(invitation) });
  });
}
