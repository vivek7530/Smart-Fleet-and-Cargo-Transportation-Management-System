import { type NextRequest } from 'next/server';
import { connectToDatabase, isDatabaseConnected } from '@/server/db';
import { handle, ok } from '@/server/api/respond';
import { env } from '@/server/config/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  return handle(async () => {
    await connectToDatabase().catch(() => undefined);
    return ok({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
      environment: env.nodeEnv,
    });
  });
}
