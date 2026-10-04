import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import {
  deleteExpense,
  getExpense,
  updateExpense,
  updateExpenseSchema,
} from '@/server/modules/expenses/expenses.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return ok({ expense: (await getExpense(id, ctx)).toJSON() });
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    const input = await parseBody(request, updateExpenseSchema);
    const expense = await updateExpense(id, input, ctx);
    return ok({ expense: expense.toJSON() });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const { id } = idParamSchema.parse(await params);
    return ok(await deleteExpense(id, ctx));
  });
}
