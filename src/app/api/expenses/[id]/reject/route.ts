import { type NextRequest } from 'next/server';
import { handle, ok, parseBody } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { rejectExpenseSchema, reviewExpense } from '@/server/modules/expenses/expenses.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A rejection always carries a reason, which the driver is shown. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const { reason } = await parseBody(request, rejectExpenseSchema);
    const expense = await reviewExpense(id, 'REJECTED', reason, ctx);
    return ok({ expense: expense.toJSON() });
  });
}
