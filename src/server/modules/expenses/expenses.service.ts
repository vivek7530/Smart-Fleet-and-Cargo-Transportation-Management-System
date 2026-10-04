import { z } from 'zod';
import { DriverExpense } from '../../models/DriverExpense';
import { Trip } from '../../models/Trip';
import { Truck } from '../../models/Truck';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  listQuerySchema,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import { notify, toId, usersWithRoles } from '../../services/notification.service';
import { recalculateTripFinancials } from '../trips/trips.service';
import { DRIVER_EXPENSE_TYPES, EXPENSE_STATUSES } from '../../types/enums';
import { dateString, objectId } from '../shared';
import type { Ctx } from '../../api/context';

export const createExpenseSchema = z.object({
  type: z.enum(DRIVER_EXPENSE_TYPES, { errorMap: () => ({ message: 'Choose an expense type' }) }),
  amount: z.coerce.number().min(1, 'Amount must be greater than zero').max(10_000_000),
  date: dateString,
  description: z.string().trim().max(1000).optional(),
  trip: objectId.nullable().optional(),
  receiptNumber: z.string().trim().max(120).optional(),
  /** Managers and admins may file a claim on behalf of a driver. */
  driver: objectId.optional(),
});

export const updateExpenseSchema = z.object({
  type: z.enum(DRIVER_EXPENSE_TYPES).optional(),
  amount: z.coerce.number().min(1).max(10_000_000).optional(),
  date: dateString.optional(),
  description: z.string().trim().max(1000).optional(),
  trip: objectId.nullable().optional(),
  receiptNumber: z.string().trim().max(120).optional(),
});

export const rejectExpenseSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required when rejecting an expense').max(1000),
});

export const listExpensesQuerySchema = listQuerySchema.extend({
  status: z.enum(EXPENSE_STATUSES).optional(),
  type: z.enum(DRIVER_EXPENSE_TYPES).optional(),
  driver: objectId.optional(),
  trip: objectId.optional(),
});

const POPULATE = [
  { path: 'driver', select: 'name avatarColor mobile email' },
  { path: 'trip', select: 'tripCode status pickupLocation deliveryLocation' },
  { path: 'reviewedBy', select: 'name role' },
];

export async function listExpenses(query: z.infer<typeof listExpensesQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'date', 'amount', 'status'], 'date');

  const filter = mergeFilters(
    // Drivers see only their own submissions.
    ctx.user.role === 'DRIVER' ? { driver: ctx.user._id } : query.driver ? { driver: query.driver } : null,
    query.status ? { status: query.status } : null,
    query.type ? { type: query.type } : null,
    query.trip ? { trip: query.trip } : null,
    searchFilter(query.search, ['description', 'receiptNumber', 'rejectionReason']),
    dateRangeFilter('date', query.from, query.to),
  );

  return paginate(DriverExpense, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

export async function expenseSummary(ctx: Ctx) {
  const match = ctx.user.role === 'DRIVER' ? { driver: ctx.user._id } : {};

  const rows = await DriverExpense.aggregate<{ _id: string; count: number; amount: number }>([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);

  const byStatus = Object.fromEntries(rows.map((row) => [row._id, { count: row.count, amount: row.amount }]));
  return {
    pending: byStatus.PENDING ?? { count: 0, amount: 0 },
    approved: byStatus.APPROVED ?? { count: 0, amount: 0 },
    rejected: byStatus.REJECTED ?? { count: 0, amount: 0 },
  };
}

export async function getExpense(id: string, ctx: Ctx) {
  const expense = await DriverExpense.findById(id).populate(POPULATE);
  if (!expense) throw ApiError.notFound('That expense could not be found');
  if (ctx.user.role === 'DRIVER' && toId(expense.driver as never) !== String(ctx.user._id)) {
    throw ApiError.forbidden('That expense does not belong to you');
  }
  return expense;
}

export async function createExpense(input: z.infer<typeof createExpenseSchema>, ctx: Ctx) {
  const isDriver = ctx.user.role === 'DRIVER';

  // A driver can only ever file their own expenses.
  const driverId = isDriver ? String(ctx.user._id) : input.driver;
  if (!isDriver && !input.driver) {
    throw ApiError.badRequest('Choose the driver this expense belongs to');
  }

  let truckId: unknown = null;
  if (input.trip) {
    const trip = await Trip.findById(input.trip).select('driver truck tripCode status');
    if (!trip) throw ApiError.badRequest('The selected trip could not be found');
    if (isDriver && String(trip.driver) !== String(ctx.user._id)) {
      throw ApiError.forbidden('That trip is not assigned to you');
    }
    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw ApiError.conflict(`Trip ${trip.tripCode} is already ${trip.status.toLowerCase()}`);
    }
    truckId = trip.truck;
  } else {
    const truck = await Truck.findOne({ assignedDriver: driverId }).select('_id');
    truckId = truck?._id ?? null;
  }

  const expense = await DriverExpense.create({
    driver: driverId,
    trip: input.trip ?? null,
    truck: truckId,
    type: input.type,
    amount: input.amount,
    date: new Date(input.date),
    description: input.description,
    receiptNumber: input.receiptNumber,
    status: 'PENDING',
  });

  await recordAudit({
    ctx,
    action: 'EXPENSE_SUBMITTED',
    summary: `${ctx.user.name} submitted a ₹${expense.amount} ${expense.type.toLowerCase()} expense`,
    entity: 'DriverExpense',
    entityId: expense._id,
    metadata: { tripId: input.trip },
  });

  await notify({
    users: await usersWithRoles('ADMIN', 'MANAGER'),
    type: 'EXPENSE_SUBMITTED',
    title: 'New expense awaiting review',
    message: `${ctx.user.name} submitted a ₹${expense.amount} ${expense.type.toLowerCase()} expense.`,
    link: '/expenses',
    entity: 'DriverExpense',
    entityId: expense._id,
  });

  return expense.populate(POPULATE);
}

export async function updateExpense(id: string, input: z.infer<typeof updateExpenseSchema>, ctx: Ctx) {
  const expense = await DriverExpense.findById(id);
  if (!expense) throw ApiError.notFound('That expense could not be found');

  if (ctx.user.role === 'DRIVER') {
    if (String(expense.driver) !== String(ctx.user._id)) {
      throw ApiError.forbidden('That expense does not belong to you');
    }
    // Once a manager has ruled on it, the driver can no longer alter the claim.
    if (expense.status !== 'PENDING') {
      throw ApiError.conflict(
        `This expense has already been ${expense.status.toLowerCase()} and can no longer be edited`,
      );
    }
  }

  Object.assign(expense, input);
  if (input.date) expense.date = new Date(input.date);
  await expense.save();
  if (expense.trip) await recalculateTripFinancials(String(expense.trip));

  await recordAudit({
    ctx,
    action: 'EXPENSE_UPDATED',
    summary: `${ctx.user.name} updated a ₹${expense.amount} expense`,
    entity: 'DriverExpense',
    entityId: expense._id,
  });

  return expense.populate(POPULATE);
}

/** Shared approve/reject path — a rejection always carries a reason. */
export async function reviewExpense(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reason: string | undefined,
  ctx: Ctx,
) {
  const expense = await DriverExpense.findById(id).populate('driver', 'name');
  if (!expense) throw ApiError.notFound('That expense could not be found');
  if (expense.status !== 'PENDING') {
    throw ApiError.conflict(`This expense has already been ${expense.status.toLowerCase()}`);
  }

  expense.status = status;
  expense.reviewedBy = ctx.user._id;
  expense.reviewedAt = new Date();
  expense.rejectionReason = status === 'REJECTED' ? reason : undefined;
  await expense.save();

  // Only approved expenses feed into the trip's cost total.
  if (expense.trip) await recalculateTripFinancials(String(expense.trip));

  const driverName = (expense.driver as unknown as { name: string }).name;

  await recordAudit({
    ctx,
    action: status === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    summary:
      status === 'APPROVED'
        ? `${ctx.user.name} approved ${driverName}'s ₹${expense.amount} expense`
        : `${ctx.user.name} rejected ${driverName}'s ₹${expense.amount} expense — ${reason}`,
    entity: 'DriverExpense',
    entityId: expense._id,
    metadata: { status, reason },
  });

  await notify({
    // `driver` is populated here; `notify` unwraps the id.
    users: [expense.driver as never],
    type: status === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    title: status === 'APPROVED' ? 'Expense approved' : 'Expense rejected',
    message:
      status === 'APPROVED'
        ? `Your ₹${expense.amount} ${expense.type.toLowerCase()} expense was approved.`
        : `Your ₹${expense.amount} ${expense.type.toLowerCase()} expense was rejected: ${reason}`,
    link: '/expenses',
    entity: 'DriverExpense',
    entityId: expense._id,
  });

  return expense.populate(POPULATE);
}

export async function deleteExpense(id: string, ctx: Ctx) {
  const expense = await DriverExpense.findById(id);
  if (!expense) throw ApiError.notFound('That expense could not be found');

  if (ctx.user.role === 'DRIVER') {
    if (String(expense.driver) !== String(ctx.user._id)) {
      throw ApiError.forbidden('That expense does not belong to you');
    }
    if (expense.status !== 'PENDING') {
      throw ApiError.conflict('Only a pending expense can be withdrawn');
    }
  }

  const tripId = expense.trip ? String(expense.trip) : null;
  await DriverExpense.deleteOne({ _id: expense._id });
  if (tripId) await recalculateTripFinancials(tripId);

  await recordAudit({
    ctx,
    action: 'EXPENSE_DELETED',
    summary: `${ctx.user.name} deleted a ₹${expense.amount} expense`,
    entity: 'DriverExpense',
    entityId: expense._id,
  });

  return { id };
}
