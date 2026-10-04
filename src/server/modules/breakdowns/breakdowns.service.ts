import { z } from 'zod';
import { BreakdownReport } from '../../models/BreakdownReport';
import { Truck } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { nextCode } from '../../models/Counter';
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
import { BREAKDOWN_SEVERITIES, BREAKDOWN_STATUSES } from '../../types/enums';
import { dateString, objectId } from '../shared';
import type { Ctx } from '../../api/context';

export const createBreakdownSchema = z.object({
  truck: objectId,
  trip: objectId.nullable().optional(),
  location: z.string().trim().min(2, 'Where did the breakdown happen?').max(200),
  description: z.string().trim().min(5, 'Describe the problem').max(2000),
  severity: z.enum(BREAKDOWN_SEVERITIES).default('MEDIUM'),
  reportedAt: dateString.optional(),
});

export const updateBreakdownStatusSchema = z.object({
  status: z.enum(BREAKDOWN_STATUSES),
  resolutionNotes: z.string().trim().max(2000).optional(),
});

export const listBreakdownsQuerySchema = listQuerySchema.extend({
  status: z.enum(BREAKDOWN_STATUSES).optional(),
  severity: z.enum(BREAKDOWN_SEVERITIES).optional(),
  truck: objectId.optional(),
  driver: objectId.optional(),
});

const POPULATE = [
  { path: 'truck', select: 'truckNumber registrationNumber make model status' },
  { path: 'driver', select: 'name mobile avatarColor' },
  { path: 'trip', select: 'tripCode status' },
  { path: 'resolvedBy', select: 'name role' },
];

export async function listBreakdowns(query: z.infer<typeof listBreakdownsQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'reportedAt', 'severity', 'status'], 'reportedAt');

  const filter = mergeFilters(
    ctx.user.role === 'DRIVER' ? { driver: ctx.user._id } : query.driver ? { driver: query.driver } : null,
    query.status ? { status: query.status } : null,
    query.severity ? { severity: query.severity } : null,
    query.truck ? { truck: query.truck } : null,
    searchFilter(query.search, ['reportCode', 'location', 'description']),
    dateRangeFilter('reportedAt', query.from, query.to),
  );

  return paginate(BreakdownReport, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

export async function getBreakdown(id: string, ctx: Ctx) {
  const report = await BreakdownReport.findById(id).populate(POPULATE);
  if (!report) throw ApiError.notFound('That breakdown report could not be found');
  if (ctx.user.role === 'DRIVER' && toId(report.driver as never) !== String(ctx.user._id)) {
    throw ApiError.forbidden('That report does not belong to you');
  }
  return report;
}

export async function createBreakdown(input: z.infer<typeof createBreakdownSchema>, ctx: Ctx) {
  const truck = await Truck.findById(input.truck).select('truckNumber assignedDriver status');
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');

  if (ctx.user.role === 'DRIVER' && String(truck.assignedDriver) !== String(ctx.user._id)) {
    throw ApiError.forbidden('You can only report breakdowns for the truck assigned to you');
  }

  // Attach the report to whatever trip the truck is currently running.
  let tripId = input.trip ?? null;
  if (!tripId) {
    const activeTrip = await Trip.findOne({
      truck: truck._id,
      status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
    }).select('_id');
    tripId = activeTrip ? String(activeTrip._id) : null;
  }

  const report = await BreakdownReport.create({
    reportCode: await nextCode('BRK'),
    truck: truck._id,
    driver: ctx.user.role === 'DRIVER' ? ctx.user._id : (truck.assignedDriver ?? ctx.user._id),
    trip: tripId,
    location: input.location,
    description: input.description,
    severity: input.severity,
    reportedAt: input.reportedAt ? new Date(input.reportedAt) : new Date(),
    status: 'REPORTED',
  });

  // A serious breakdown takes the truck off the road immediately.
  if (['HIGH', 'CRITICAL'].includes(report.severity) && truck.status !== 'MAINTENANCE') {
    truck.status = 'MAINTENANCE';
    await truck.save();
  }

  await recordAudit({
    ctx,
    action: 'BREAKDOWN_REPORTED',
    summary: `${ctx.user.name} reported a ${report.severity.toLowerCase()} breakdown for truck ${truck.truckNumber} at ${report.location}`,
    entity: 'BreakdownReport',
    entityId: report._id,
  });

  await notify({
    users: await usersWithRoles('ADMIN', 'MANAGER'),
    type: 'BREAKDOWN_REPORTED',
    title: `${report.severity} breakdown — ${truck.truckNumber}`,
    message: `${ctx.user.name} reported a breakdown at ${report.location}: ${report.description.slice(0, 120)}`,
    link: `/breakdowns/${report._id}`,
    entity: 'BreakdownReport',
    entityId: report._id,
  });

  return report.populate(POPULATE);
}

export async function updateBreakdownStatus(
  id: string,
  input: z.infer<typeof updateBreakdownStatusSchema>,
  ctx: Ctx,
) {
  const report = await BreakdownReport.findById(id);
  if (!report) throw ApiError.notFound('That breakdown report could not be found');

  report.status = input.status;
  if (input.resolutionNotes) report.resolutionNotes = input.resolutionNotes;

  if (input.status === 'ACKNOWLEDGED' && !report.acknowledgedAt) {
    report.acknowledgedBy = ctx.user._id;
    report.acknowledgedAt = new Date();
  }

  if (input.status === 'RESOLVED') {
    report.resolvedBy = ctx.user._id;
    report.resolvedAt = new Date();

    // Put the truck back into service once nothing else is holding it.
    const otherOpen = await BreakdownReport.countDocuments({
      truck: report.truck,
      _id: { $ne: report._id },
      status: { $nin: ['RESOLVED', 'CANCELLED'] },
    });
    if (otherOpen === 0) {
      const truck = await Truck.findById(report.truck);
      if (truck && truck.status === 'MAINTENANCE') {
        truck.status = truck.assignedDriver ? 'ASSIGNED' : 'AVAILABLE';
        await truck.save();
      }
    }
  }

  await report.save();

  await recordAudit({
    ctx,
    action: `BREAKDOWN_${input.status}`,
    summary: `${ctx.user.name} marked breakdown ${report.reportCode} as ${input.status.toLowerCase()}`,
    entity: 'BreakdownReport',
    entityId: report._id,
  });

  await notify({
    users: [report.driver],
    type: 'BREAKDOWN_UPDATED',
    title: `Breakdown ${report.reportCode} — ${input.status.toLowerCase()}`,
    message: input.resolutionNotes ?? `Your breakdown report is now ${input.status.toLowerCase()}.`,
    link: `/breakdowns/${report._id}`,
    entity: 'BreakdownReport',
    entityId: report._id,
  });

  return report.populate(POPULATE);
}
