import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { rejectDocumentSchema, reviewDocument } from '@/server/modules/documents/documents.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const { reason } = await parseBody(request, rejectDocumentSchema);
    const document = await reviewDocument(id, 'REJECTED', reason, ctx);
    return ok({ document: document.toJSON() });
  });
}
