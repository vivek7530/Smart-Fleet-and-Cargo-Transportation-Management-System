import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { getDriver } from '@/server/modules/drivers/drivers.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await getDriver(id));
  });
}
