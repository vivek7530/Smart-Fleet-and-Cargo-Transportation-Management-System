import { type NextRequest } from 'next/server';
import { created, handle, ok, parseBody, parseQuery } from '@/server/api/respond';
import { requireAuth } from '@/server/api/context';
import {
  createExpense,
  createExpenseSchema,
  listExpenses,
  listExpensesQuerySchema,
} from '@/server/modules/expenses/expenses.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    return ok(await listExpenses(parseQuery(request, listExpensesQuerySchema), ctx));
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth(request);
    const input = await parseBody(request, createExpenseSchema);
    const expense = await createExpense(input, ctx);
    return created({ expense: expense.toJSON() });
  });
}
