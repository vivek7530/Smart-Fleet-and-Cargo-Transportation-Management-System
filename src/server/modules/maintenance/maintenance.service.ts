import { z } from 'zod';
import { Maintenance } from '../../models/Maintenance';
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
import { notify } from '../../services/notification.service';
import { MAINTENANCE_STATUSES, MAINTENANCE_TYPES } from '../../types/enums';
import { dateString, objectId, optionalDateString } from '../shared';
import type { Ctx } from '../../api/context';

export const createMaintenanceSchema = z.object({
  truck: objectId,
  type: z.enum(MAINTENANCE_TYPES),
  description: z.string().trim().min(3, 'Describe the work carried out').max(2000),
  cost: z.coerce.number().min(0, 'Cost cannot be negative'),
  date: dateString,
  serviceProvider: z.string().trim().max(160).optional(),
  nextServiceDate: optionalDateString,
  odometerKm: z.coerce.number().min(0).optional(),
  status: z.enum(MAINTENANCE_STATUSES).default('COMPLETED'),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const listMaintenanceQuerySchema = listQuerySchema.extend({
  truck: objectId.optional(),
  type: z.enum(MAINTENANCE_TYPES).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
});

const POPULATE = [{ path: 'truck', select: 'truckNumber registrationNumber make model status' }];

export async function listMaintenance(query: z.infer<typeof listMaintenanceQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'date', 'cost', 'status'], 'date');

  // A driver only sees the history of the truck they currently hold.
  let scope: Record<string, unknown> | null = null;
  if (ctx.user.role === 'DRIVER') {
    const truck = await Truck.findOne({ assignedDriver: ctx.user._id }).select('_id');
    scope = { truck: truck?._id ?? null };
  }

  const filter = mergeFilters(
    scope,
    query.truck && ctx.user.role !== 'DRIVER' ? { truck: query.truck } : null,
    query.type ? { type: query.type } : null,
    query.status ? { status: query.status } : null,
    searchFilter(query.search, ['description', 'serviceProvider']),
    dateRangeFilter('date', query.from, query.to),
  );

  return paginate(Maintenance, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: POPULATE,
  });
}

export async function createMaintenance(input: z.infer<typeof createMaintenanceSchema>, ctx: Ctx) {
  const truck = await Truck.findById(input.truck);
  if (!truck) throw ApiError.badRequest('The selected truck could not be found');

  const record = await Maintenance.create({
    ...input,
    date: new Date(input.date),
    nextServiceDate: input.nextServiceDate ? new Date(input.nextServiceDate) : null,
    createdBy: ctx.user._id,
  });

  // Scheduled or in-progress work takes the truck off the road.
  if (record.status === 'IN_PROGRESS' || record.status === 'SCHEDULED') {
    if (truck.status !== 'IN_TRIP') {
      truck.status = 'MAINTENANCE';
      await truck.save();
    }
  } else if (truck.status === 'MAINTENANCE') {
    truck.status = truck.assignedDriver ? 'ASSIGNED' : 'AVAILABLE';
    await truck.save();
  }

  if (input.odometerKm != null) await Truck.updateOne({ _id: truck._id }, { odometerKm: input.odometerKm });

  await recordAudit({
    ctx,
    action: 'MAINTENANCE_CREATED',
    summary: `${ctx.user.name} logged ${humanise(record.type)} maintenance for truck ${truck.truckNumber} (₹${record.cost})`,
    entity: 'Maintenance',
    entityId: record._id,
  });

  if (truck.assignedDriver) {
    await notify({
      users: [truck.assignedDriver],
      type: 'MAINTENANCE_DUE',
      title: `Maintenance logged for ${truck.truckNumber}`,
      message: `${humanise(record.type)} — ${record.description.slice(0, 120)}`,
      link: '/maintenance',
      entity: 'Maintenance',
      entityId: record._id,
    });
  }

  return record.populate(POPULATE);
}

export async function updateMaintenance(id: string, input: z.infer<typeof updateMaintenanceSchema>, ctx: Ctx) {
  const record = await Maintenance.findById(id);
  if (!record) throw ApiError.notFound('That maintenance record could not be found');

  Object.assign(record, input);
  if (input.date) record.date = new Date(input.date);
  if (input.nextServiceDate !== undefined) {
    record.nextServiceDate = input.nextServiceDate ? new Date(input.nextServiceDate) : null;
  }
  await record.save();

  // Completing the job hands the truck back to the fleet.
  if (record.status === 'COMPLETED') {
    const truck = await Truck.findById(record.truck);
    if (truck && truck.status === 'MAINTENANCE') {
      truck.status = truck.assignedDriver ? 'ASSIGNED' : 'AVAILABLE';
      await truck.save();
    }
  }

  await recordAudit({
    ctx,
    action: 'MAINTENANCE_UPDATED',
    summary: `${ctx.user.name} updated a maintenance record`,
    entity: 'Maintenance',
    entityId: record._id,
  });

  return record.populate(POPULATE);
}

export async function deleteMaintenance(id: string, ctx: Ctx) {
  const record = await Maintenance.findById(id);
  if (!record) throw ApiError.notFound('That maintenance record could not be found');
  await Maintenance.deleteOne({ _id: record._id });

  await recordAudit({
    ctx,
    action: 'MAINTENANCE_DELETED',
    summary: `${ctx.user.name} deleted a maintenance record`,
    entity: 'Maintenance',
    entityId: record._id,
  });

  return { id };
}

function humanise(value: string) {
  return value.toLowerCase().replace(/_/g, ' ');
}
