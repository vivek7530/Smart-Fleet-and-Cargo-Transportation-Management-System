import { z } from 'zod';
import { Maintenance } from '../../models/Maintenance';
import { Truck } from '../../models/Truck';
import { Trip } from '../../models/Trip';
import { BreakdownReport } from '../../models/BreakdownReport';
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
import { advanceTruckOdometer } from '../../services/odometer.service';
import { managerFilterFor, requireTruckAccess, truckScopeFilter } from '../../services/ownership.service';
import { isAdmin } from '../../lib/ownership';

export const createMaintenanceSchema = z.object({
  truck: objectId,
  type: z.enum(MAINTENANCE_TYPES),
  description: z.string().trim().min(3, 'Describe the work carried out').max(2000),
  cost: z.coerce.number().finite().min(0, 'Cost cannot be negative').multipleOf(0.01).default(0),
  estimatedPartsCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  estimatedLabourCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  estimatedOtherCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  estimatedTax: z.coerce.number().min(0).multipleOf(0.01).default(0),
  actualPartsCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  actualLabourCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  actualOtherCost: z.coerce.number().min(0).multipleOf(0.01).default(0),
  actualTax: z.coerce.number().min(0).multipleOf(0.01).default(0),
  date: dateString,
  serviceProvider: z.string().trim().max(160).optional(),
  nextServiceDate: optionalDateString,
  odometerKm: z.coerce.number().finite().min(0).multipleOf(0.1).optional(),
  status: z.enum(MAINTENANCE_STATUSES).default('COMPLETED'),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const listMaintenanceQuerySchema = listQuerySchema.extend({
  truck: objectId.optional(),
  type: z.enum(MAINTENANCE_TYPES).optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  /** Administrative: everything belonging to one manager. Ignored for anyone else. */
  manager: objectId.optional(),
});

const POPULATE = [{ path: 'truck', select: 'truckNumber registrationNumber make model status' }];

export async function listMaintenance(query: z.infer<typeof listMaintenanceQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'date', 'cost', 'status'], 'date');

  // A driver only sees the history of the truck they currently hold.
  let scope: Record<string, unknown> | null = null;
  if (ctx.user.role === 'DRIVER') {
    const truck = await Truck.findOne({ assignedDriver: ctx.user._id }).select('_id');
    scope = { truck: truck?._id ?? null };
  } else {
    // Maintenance has no owner of its own, so it borrows the truck's.
    scope = await truckScopeFilter(ctx.user);
  }

  const filter = mergeFilters(
    scope,
    query.truck && ctx.user.role !== 'DRIVER' ? { truck: query.truck } : null,
    query.type ? { type: query.type } : null,
    query.status ? { status: query.status } : null,
    isAdmin(ctx.user) && query.manager ? await managerFilterFor(query.manager, { truck: 'truck' }) : null,
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
  // Booking maintenance puts a truck into MAINTENANCE status, which takes it
  // off the road. Unguarded, one manager could ground another's vehicle.
  const truck = await requireTruckAccess(input.truck, ctx.user);

  if (input.status === 'IN_PROGRESS') {
    const activeTrip = await Trip.exists({
      truck: truck._id,
      status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] },
    });
    if (activeTrip) throw ApiError.conflict('Maintenance cannot start while the truck has an active trip');
  }
  if (input.status === 'SCHEDULED') {
    const dayStart = new Date(input.date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const overlappingTrip = await Trip.exists({
      truck: truck._id,
      status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED'] },
      startDate: { $lte: dayEnd },
      $or: [
        { $expr: { $gte: [{ $ifNull: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, dayStart] } },
        {
          status: 'IN_TRANSIT',
          $expr: {
            $lt: [
              { $dateToString: { date: '$expectedDeliveryDate', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
              new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
            ],
          },
        },
        {
          status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING'] },
          $expr: {
            $lt: [
              { $dateToString: { date: '$startDate', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
              new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
            ],
          },
        },
      ],
    });
    if (overlappingTrip) throw ApiError.conflict('Maintenance cannot be scheduled during a reserved trip window');
  }
  if (input.odometerKm != null) {
    if (input.odometerKm < truck.odometerKm) throw ApiError.validation('Maintenance odometer cannot be below the latest verified truck reading');
    await advanceTruckOdometer(String(truck._id), input.odometerKm);
  }
  const estimatedCost = sumCosts(input.estimatedPartsCost, input.estimatedLabourCost, input.estimatedOtherCost, input.estimatedTax);
  const actualComponents = sumCosts(input.actualPartsCost, input.actualLabourCost, input.actualOtherCost, input.actualTax);
  const actualCost = actualComponents > 0 ? actualComponents : input.cost;

  const record = await Maintenance.create({
    ...input,
    cost: input.status === 'COMPLETED' ? actualCost : 0,
    estimatedCost,
    approvedBy: input.status === 'COMPLETED' ? ctx.user._id : null,
    date: new Date(input.date),
    nextServiceDate: input.nextServiceDate ? new Date(input.nextServiceDate) : null,
    createdBy: ctx.user._id,
  });

  // Scheduled or in-progress work takes the truck off the road.
  await syncTruckMaintenanceStatus(String(truck._id));

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
  await requireTruckAccess(String(record.truck), ctx.user);
  if (input.truck && String(input.truck) !== String(record.truck)) {
    await requireTruckAccess(String(input.truck), ctx.user);
  }

  if (input.odometerKm !== undefined && record.odometerKm !== undefined && input.odometerKm !== record.odometerKm) {
    throw ApiError.conflict('Submitted maintenance odometer readings cannot be edited; use the authorized correction workflow');
  }

  const previousStatus = record.status;
  if (previousStatus === 'COMPLETED' && input.status !== undefined && input.status !== 'COMPLETED') {
    throw ApiError.conflict('Completed maintenance is a historical record and cannot be reopened or cancelled');
  }
  const previousTruckId = String(record.truck);
  const targetTruckId = input.truck ?? previousTruckId;
  if (input.truck !== undefined && targetTruckId !== previousTruckId && record.odometerKm != null) {
    throw ApiError.conflict('A maintenance record with a verified odometer cannot be moved to another truck');
  }
  const targetTruck = await Truck.findById(targetTruckId).select('odometerKm');
  if (!targetTruck) throw ApiError.badRequest('The selected truck could not be found');
  const targetStatus = input.status ?? record.status;
  const targetDate = input.date ? new Date(input.date) : record.date;

  if (targetStatus === 'IN_PROGRESS') {
    const activeTrip = await Trip.exists({ truck: targetTruckId, status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } });
    if (activeTrip) throw ApiError.conflict('Maintenance cannot start while the truck has an active trip');
  }
  if (targetStatus === 'SCHEDULED') {
    await assertMaintenanceDateAvailable(targetTruckId, targetDate);
  }
  if (input.odometerKm !== undefined && record.odometerKm === undefined) {
    if (input.odometerKm < targetTruck.odometerKm) throw ApiError.validation('Maintenance odometer cannot be below the latest verified truck reading');
    await advanceTruckOdometer(targetTruckId, input.odometerKm);
  }

  Object.assign(record, input);
  record.estimatedCost = sumCosts(record.estimatedPartsCost, record.estimatedLabourCost, record.estimatedOtherCost, record.estimatedTax);
  const actualComponents = sumCosts(record.actualPartsCost, record.actualLabourCost, record.actualOtherCost, record.actualTax);
  record.cost = record.status === 'COMPLETED'
    ? (actualComponents > 0 ? actualComponents : input.cost ?? record.cost)
    : 0;
  if (previousStatus !== 'COMPLETED' && record.status === 'COMPLETED') record.approvedBy = ctx.user._id;
  if (input.date) record.date = new Date(input.date);
  if (input.nextServiceDate !== undefined) {
    record.nextServiceDate = input.nextServiceDate ? new Date(input.nextServiceDate) : null;
  }
  await record.save();

  // Completing the job hands the truck back to the fleet.
  await syncTruckMaintenanceStatus(previousTruckId);
  if (targetTruckId !== previousTruckId) await syncTruckMaintenanceStatus(targetTruckId);

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
  await requireTruckAccess(String(record.truck), ctx.user);
  if (record.status === 'COMPLETED') {
    throw ApiError.conflict('Completed maintenance is a historical record and cannot be deleted');
  }
  await Maintenance.deleteOne({ _id: record._id });
  await syncTruckMaintenanceStatus(String(record.truck));

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

function sumCosts(...values: number[]) {
  return Math.round(values.reduce((total, value) => total + (value || 0), 0) * 100) / 100;
}

async function syncTruckMaintenanceStatus(truckId: string) {
  const truck = await Truck.findById(truckId);
  if (!truck) return;
  const [inProgress, activeTrip, severeBreakdown] = await Promise.all([
    Maintenance.exists({ truck: truck._id, status: 'IN_PROGRESS' }),
    Trip.exists({ truck: truck._id, status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } }),
    BreakdownReport.exists({ truck: truck._id, severity: { $in: ['HIGH', 'CRITICAL'] }, status: { $nin: ['RESOLVED', 'CANCELLED'] } }),
  ]);
  if (inProgress || severeBreakdown) truck.status = 'MAINTENANCE';
  else if (truck.status === 'MAINTENANCE') truck.status = activeTrip ? 'IN_TRIP' : truck.assignedDriver ? 'ASSIGNED' : 'AVAILABLE';
  await truck.save();
}

async function assertMaintenanceDateAvailable(truckId: string, date: Date) {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const overlap = await Trip.exists({
    truck: truckId,
    status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING', 'IN_TRANSIT', 'DELIVERED'] },
    startDate: { $lte: dayEnd },
    $or: [
      { $expr: { $gte: [{ $ifNull: ['$actualDeliveryDate', '$expectedDeliveryDate'] }, dayStart] } },
      {
        status: 'IN_TRANSIT',
        $expr: {
          $lt: [
            { $dateToString: { date: '$expectedDeliveryDate', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
          ],
        },
      },
      {
        status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING'] },
        $expr: {
          $lt: [
            { $dateToString: { date: '$startDate', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
          ],
        },
      },
    ],
  });
  if (overlap) throw ApiError.conflict('Maintenance cannot be scheduled during a reserved trip window');
}
