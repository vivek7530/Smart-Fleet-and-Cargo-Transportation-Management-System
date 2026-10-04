import { type NextRequest } from 'next/server';
import { handle, ok, parseQuery } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { listDrivers, listDriversQuerySchema } from '@/server/modules/drivers/drivers.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    return ok(await listDrivers(parseQuery(request, listDriversQuerySchema)));
  });
}
