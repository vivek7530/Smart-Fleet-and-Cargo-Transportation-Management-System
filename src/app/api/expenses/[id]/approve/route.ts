import { type NextRequest } from 'next/server';
import { handle, ok } from '@/server/api/respond';
import { requireStaff } from '@/server/api/context';
import { idParamSchema } from '@/server/modules/shared';
import { reviewExpense } from '@/server/modules/expenses/expenses.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ctx = await requireStaff(request);
    const { id } = idParamSchema.parse(await params);
    const expense = await reviewExpense(id, 'APPROVED', undefined, ctx);
    return ok({ expense: expense.toJSON() });
  });
}
