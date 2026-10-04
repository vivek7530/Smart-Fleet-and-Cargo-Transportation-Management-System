import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import {
  deleteDocument,
  updateDocument,
  updateDocumentSchema,
} from '@/server/modules/documents/documents.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateDocumentSchema);
    const document = await updateDocument(id, input, ctx);
    return ok({ document: document.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteDocument(id, ctx));
  });
}
