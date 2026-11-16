import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { correctOdometer, odometerCorrectionSchema } from '@/server/services/odometer.service';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const input = await parseBody(request, odometerCorrectionSchema);
    return ok(await correctOdometer(input, ctx));
  });
}
