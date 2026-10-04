import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { expiringDocuments } from '@/server/modules/documents/documents.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Powers the "documents expiring soon" widget on the dashboard. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireStaff(request);
    const days = Number(request.nextUrl.searchParams.get('days') ?? 30) || 30;
    return ok(await expiringDocuments(days));
  });
}
