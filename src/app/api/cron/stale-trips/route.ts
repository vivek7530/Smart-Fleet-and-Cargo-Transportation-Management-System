import { timingSafeEqual } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireAdmin } from '@/server/api/context';
import { connectToDatabase } from '@/server/db';
import { env } from '@/server/config/env';
import { sweepStaleTrips } from '@/server/services/stale-trips.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time, and false for a missing or mismatched-length secret. */
function presentedCronSecret(request: NextRequest): boolean {
  if (!env.cronSecret) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(env.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The daily sweep for trips holding a truck and driver without accounting for
 * them. A scheduler calls this with the shared secret; an administrator can
 * also run it by hand from a signed-in session, which is how it is tested.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    if (presentedCronSecret(request)) {
      await connectToDatabase();
    } else {
      // No secret, or the wrong one: fall back to a signed-in administrator.
      // This throws 401/403 of its own accord, so nothing unauthenticated runs.
      await requireAdmin(request);
    }

    return ok(await sweepStaleTrips());
  });
}
