import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth, requireStaff } from '@/server/api/context';
import {
  createMaintenance,
  createMaintenanceSchema,
  listMaintenance,
  listMaintenanceQuerySchema,
} from '@/server/modules/maintenance/maintenance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    // Drivers see the history of their own truck only.
    const ctx = await requireAuth(request);
    return ok(await listMaintenance(parseQuery(request, listMaintenanceQuerySchema), ctx));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, createMaintenanceSchema);
    const record = await createMaintenance(input, ctx);
    return created({ maintenance: record.toJSON() });
  });
}
