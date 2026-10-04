import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import {
  createDocument,
  createDocumentSchema,
  listDocuments,
  listDocumentsQuerySchema,
} from '@/server/modules/documents/documents.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await listDocuments(parseQuery(request, listDocumentsQuerySchema), ctx));
  });
}

/** Documents are metadata records — reference numbers and validity dates only. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, createDocumentSchema);
    const document = await createDocument(input, ctx);
    return created({ document: document.toJSON() });
  });
}
