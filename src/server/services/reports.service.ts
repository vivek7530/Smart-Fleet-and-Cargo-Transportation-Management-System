import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { Trip } from '../models/Trip';
import { Truck } from '../models/Truck';
import { User, type UserDocument } from '../models/User';
import { FuelRecord } from '../models/FuelRecord';
import { Maintenance } from '../models/Maintenance';
import { DriverExpense } from '../models/DriverExpense';
import { TransportationCost } from '../models/TransportationCost';
import { DocumentRecord } from '../models/DocumentRecord';
import { BreakdownReport } from '../models/BreakdownReport';

export type Granularity = 'day' | 'week' | 'month';

/**
 * Shared query contract for every reporting endpoint. It lives here rather than
 * in a route file because Next.js only allows HTTP handlers to be exported from
 * `route.ts`.
 */
export const rangeQuerySchema = z.object({
  preset: z.enum(['today', 'week', 'month', 'last-month', 'year', 'all', 'custom']).default('month'),
  from: z.string().datetime().or(z.string().date()).optional(),
  to: z.string().datetime().or(z.string().date()).optional(),
  granularity: z.enum(['day', 'week', 'month']).optional(),
});

export interface DateRange {
  from: Date;
  to: Date;
}

/** Resolves a named preset (or an explicit range) into concrete boundaries. */
export function resolveRange(preset?: string, from?: string, to?: string): DateRange {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'custom' && (from || to)) {
    return {
      from: from ? startOfDay(new Date(from)) : new Date(now.getFullYear(), 0, 1),
      to: to ? endOfDay(new Date(to)) : endOfToday,
    };
  }

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfToday };
    case 'week': {
      // Weeks start on Monday.
      const day = (now.getDay() + 6) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      return { from: monday, to: endOfToday };
    }
    case 'last-month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: first, to: last };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday };
    case 'all':
      return { from: new Date(2000, 0, 1), to: endOfToday };
    case 'month':
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfToday };
  }
}

/** The equally long window immediately before `range` — used for trend deltas. */
export function previousRange(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span - 1), to: new Date(range.from.getTime() - 1) };
}

export function pickGranularity(range: DateRange, requested?: Granularity): Granularity {
  if (requested) return requested;
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

async function sumOf(
  model: { aggregate: (pipeline: PipelineStage[]) => Promise<{ total: number }[]> },
  field: string,
  dateField: string,
  range: DateRange,
  extraMatch: Record<string, unknown> = {},
): Promise<number> {
  const rows = await model.aggregate([
    { $match: { [dateField]: { $gte: range.from, $lte: range.to }, ...extraMatch } },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return round(rows[0]?.total ?? 0);
}

/** Revenue + the four expense buckets for a window, taken from their source collections. */
export async function financialsFor(range: DateRange, driverId?: string) {
  const driverTripMatch = driverId ? { driver: new Types.ObjectId(driverId) } : {};

  const [revenue, fuel, maintenance, driverExpenses, transportation] = await Promise.all([
    sumOf(Trip, 'revenue', 'startDate', range, { status: { $ne: 'CANCELLED' }, ...driverTripMatch }),
    sumOf(FuelRecord, 'totalCost', 'date', range, driverId ? { driver: new Types.ObjectId(driverId) } : {}),
    // Maintenance is a fleet-level cost, so it is excluded from a driver's own view.
    driverId ? Promise.resolve(0) : sumOf(Maintenance, 'cost', 'date', range),
    sumOf(DriverExpense, 'amount', 'date', range, {
      status: 'APPROVED',
      ...(driverId ? { driver: new Types.ObjectId(driverId) } : {}),
    }),
    driverId ? Promise.resolve(0) : sumOf(TransportationCost, 'amount', 'date', range),
  ]);

  const totalExpenses = round(fuel + maintenance + driverExpenses + transportation);

  return {
    revenue,
    fuelExpenses: fuel,
    maintenanceExpenses: maintenance,
    driverExpenses,
    transportationCosts: transportation,
    totalExpenses,
    profit: round(revenue - totalExpenses),
    margin: revenue > 0 ? round(((revenue - totalExpenses) / revenue) * 100) : 0,
  };
}

/** Role-aware dashboard payload. */
export async function buildDashboard(user: UserDocument, range: DateRange) {
  if (user.role === 'DRIVER') return buildDriverDashboard(user, range);

  const previous = previousRange(range);

  const [
    fleet,
    driverCounts,
    tripCounts,
    tripsInRange,
    previousTrips,
    financials,
    previousFinancials,
    pendingExpenses,
    openBreakdowns,
    expiringDocuments,
    recentTrips,
    revenueSeries,
  ] = await Promise.all([
    Truck.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { role: 'DRIVER' } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Trip.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Trip.countDocuments({ startDate: { $gte: range.from, $lte: range.to } }),
    Trip.countDocuments({ startDate: { $gte: previous.from, $lte: previous.to } }),
    financialsFor(range),
    financialsFor(previous),
    DriverExpense.aggregate<{ count: number; amount: number }>([
      { $match: { status: 'PENDING' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    BreakdownReport.countDocuments({ status: { $nin: ['RESOLVED', 'CANCELLED'] } }),
    DocumentRecord.countDocuments({
      expiryDate: { $ne: null, $lte: new Date(Date.now() + 30 * 86_400_000) },
      status: { $ne: 'REJECTED' },
    }),
    Trip.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('truck', 'truckNumber')
      .populate('driver', 'name avatarColor'),
    // A compact 12-point series that feeds the sparklines on the KPI cards.
    timeSeries(range, pickGranularity(range)),
  ]);

  const byTruckStatus = countsToMap(fleet);
  const byDriverStatus = countsToMap(driverCounts);
  const byTripStatus = countsToMap(tripCounts);

  return {
    range,
    kpis: {
      totalTrucks: sumValues(byTruckStatus),
      activeTrucks: (byTruckStatus.IN_TRIP ?? 0) + (byTruckStatus.ASSIGNED ?? 0),
      availableTrucks: byTruckStatus.AVAILABLE ?? 0,
      maintenanceTrucks: byTruckStatus.MAINTENANCE ?? 0,
      inactiveTrucks: byTruckStatus.INACTIVE ?? 0,
      totalDrivers: sumValues(byDriverStatus),
      activeDrivers: byDriverStatus.ACTIVE ?? 0,
      invitedDrivers: byDriverStatus.INVITED ?? 0,
      activeTrips: (byTripStatus.ASSIGNED ?? 0) + (byTripStatus.LOADING ?? 0) + (byTripStatus.IN_TRANSIT ?? 0),
      plannedTrips: byTripStatus.PLANNED ?? 0,
      completedTrips: byTripStatus.COMPLETED ?? 0,
      cancelledTrips: byTripStatus.CANCELLED ?? 0,
      tripsInRange,
      ...financials,
      pendingExpenseCount: pendingExpenses[0]?.count ?? 0,
      pendingExpenseAmount: round(pendingExpenses[0]?.amount ?? 0),
      openBreakdowns,
      expiringDocuments,
    },
    trends: {
      revenue: percentChange(financials.revenue, previousFinancials.revenue),
      expenses: percentChange(financials.totalExpenses, previousFinancials.totalExpenses),
      profit: percentChange(financials.profit, previousFinancials.profit),
      trips: percentChange(tripsInRange, previousTrips),
    },
    fleetStatus: Object.entries(byTruckStatus).map(([status, count]) => ({ status, count })),
    tripStatus: Object.entries(byTripStatus).map(([status, count]) => ({ status, count })),
    series: revenueSeries,
    recentTrips: recentTrips.map((trip) => trip.toJSON()),
  };
}

async function buildDriverDashboard(user: UserDocument, range: DateRange) {
  const driverId = user._id;

  const [tripCounts, assignedTruck, expenseRows, fuelTotal, activeTrip, upcomingTrips, openBreakdowns] =
    await Promise.all([
      Trip.aggregate<{ _id: string; count: number }>([
        { $match: { driver: driverId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Truck.findOne({ assignedDriver: driverId }).select(
        'truckNumber registrationNumber make model status odometerKm capacityTons fuelType insuranceExpiry',
      ),
      DriverExpense.aggregate<{ _id: string; count: number; amount: number }>([
        { $match: { driver: driverId } },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      sumOf(FuelRecord, 'totalCost', 'date', range, { driver: driverId }),
      Trip.findOne({ driver: driverId, status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } })
        .populate('truck', 'truckNumber make model')
        .populate('cargo', 'cargoCode description weightTons'),
      Trip.find({ driver: driverId, status: { $in: ['PLANNED', 'ASSIGNED'] } })
        .sort({ startDate: 1 })
        .limit(5)
        .populate('truck', 'truckNumber'),
      BreakdownReport.countDocuments({ driver: driverId, status: { $nin: ['RESOLVED', 'CANCELLED'] } }),
    ]);

  const byStatus = countsToMap(tripCounts);
  const expenses = Object.fromEntries(
    expenseRows.map((row) => [row._id, { count: row.count, amount: round(row.amount) }]),
  );

  return {
    range,
    kpis: {
      totalTrips: sumValues(byStatus),
      activeTrips: (byStatus.ASSIGNED ?? 0) + (byStatus.LOADING ?? 0) + (byStatus.IN_TRANSIT ?? 0),
      completedTrips: byStatus.COMPLETED ?? 0,
      plannedTrips: byStatus.PLANNED ?? 0,
      pendingExpenseCount: expenses.PENDING?.count ?? 0,
      pendingExpenseAmount: expenses.PENDING?.amount ?? 0,
      approvedExpenseAmount: expenses.APPROVED?.amount ?? 0,
      rejectedExpenseCount: expenses.REJECTED?.count ?? 0,
      fuelSpendInRange: fuelTotal,
      openBreakdowns,
    },
    assignedTruck: assignedTruck?.toJSON() ?? null,
    activeTrip: activeTrip?.toJSON() ?? null,
    upcomingTrips: upcomingTrips.map((trip) => trip.toJSON()),
    expenses,
  };
}

/**
 * One bucketed series holding revenue, every expense bucket, profit and trip
 * counts — everything the analytics charts need in a single round trip.
 */
export async function timeSeries(range: DateRange, granularity: Granularity, driverId?: string) {
  const unit = granularity;
  const driverMatch = driverId ? { driver: new Types.ObjectId(driverId) } : {};

  const bucket = (dateField: string) => ({
    $dateTrunc: { date: `$${dateField}`, unit, startOfWeek: 'monday' },
  });

  const [trips, fuel, maintenance, expenses, transport] = await Promise.all([
    Trip.aggregate<{ _id: Date; revenue: number; trips: number }>([
      {
        $match: {
          startDate: { $gte: range.from, $lte: range.to },
          status: { $ne: 'CANCELLED' },
          ...driverMatch,
        },
      },
      { $group: { _id: bucket('startDate'), revenue: { $sum: '$revenue' }, trips: { $sum: 1 } } },
    ]),
    FuelRecord.aggregate<{ _id: Date; total: number }>([
      { $match: { date: { $gte: range.from, $lte: range.to }, ...driverMatch } },
      { $group: { _id: bucket('date'), total: { $sum: '$totalCost' } } },
    ]),
    driverId
      ? Promise.resolve([] as { _id: Date; total: number }[])
      : Maintenance.aggregate<{ _id: Date; total: number }>([
          { $match: { date: { $gte: range.from, $lte: range.to } } },
          { $group: { _id: bucket('date'), total: { $sum: '$cost' } } },
        ]),
    DriverExpense.aggregate<{ _id: Date; total: number }>([
      { $match: { date: { $gte: range.from, $lte: range.to }, status: 'APPROVED', ...driverMatch } },
      { $group: { _id: bucket('date'), total: { $sum: '$amount' } } },
    ]),
    driverId
      ? Promise.resolve([] as { _id: Date; total: number }[])
      : TransportationCost.aggregate<{ _id: Date; total: number }>([
          { $match: { date: { $gte: range.from, $lte: range.to } } },
          { $group: { _id: bucket('date'), total: { $sum: '$amount' } } },
        ]),
  ]);

  const buckets = enumerateBuckets(range, unit);
  const index = (rows: { _id: Date; [key: string]: unknown }[], key: string) =>
    new Map(rows.map((row) => [new Date(row._id).toISOString(), Number(row[key] ?? 0)]));

  const revenueBy = index(trips, 'revenue');
  const tripsBy = index(trips, 'trips');
  const fuelBy = index(fuel, 'total');
  const maintenanceBy = index(maintenance, 'total');
  const expensesBy = index(expenses, 'total');
  const transportBy = index(transport, 'total');

  return buckets.map((date) => {
    const key = date.toISOString();
    const revenue = round(revenueBy.get(key) ?? 0);
    const fuelCost = round(fuelBy.get(key) ?? 0);
    const maintenanceCost = round(maintenanceBy.get(key) ?? 0);
    const driverExpense = round(expensesBy.get(key) ?? 0);
    const transportCost = round(transportBy.get(key) ?? 0);
    const totalExpenses = round(fuelCost + maintenanceCost + driverExpense + transportCost);

    return {
      date: key,
      label: formatBucketLabel(date, unit),
      revenue,
      fuelExpenses: fuelCost,
      maintenanceExpenses: maintenanceCost,
      driverExpenses: driverExpense,
      transportationCosts: transportCost,
      expenses: totalExpenses,
      profit: round(revenue - totalExpenses),
      trips: tripsBy.get(key) ?? 0,
    };
  });
}

/** Leaderboards shown on the reports page. */
export async function buildLeaderboards(range: DateRange) {
  const match = { startDate: { $gte: range.from, $lte: range.to }, status: { $ne: 'CANCELLED' } };

  const [topDrivers, topTrucks, topRoutes, expensesByType] = await Promise.all([
    Trip.aggregate([
      { $match: { ...match, driver: { $ne: null } } },
      { $group: { _id: '$driver', trips: { $sum: 1 }, revenue: { $sum: '$revenue' } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'driver' } },
      { $unwind: '$driver' },
      {
        $project: {
          _id: 0,
          id: '$_id',
          name: '$driver.name',
          avatarColor: '$driver.avatarColor',
          trips: 1,
          revenue: 1,
        },
      },
    ]),
    Trip.aggregate([
      { $match: { ...match, truck: { $ne: null } } },
      { $group: { _id: '$truck', trips: { $sum: 1 }, revenue: { $sum: '$revenue' } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'trucks', localField: '_id', foreignField: '_id', as: 'truck' } },
      { $unwind: '$truck' },
      {
        $project: {
          _id: 0,
          id: '$_id',
          truckNumber: '$truck.truckNumber',
          make: '$truck.make',
          model: '$truck.model',
          trips: 1,
          revenue: 1,
        },
      },
    ]),
    Trip.aggregate([
      { $match: match },
      {
        $group: {
          _id: { pickup: '$pickupLocation', delivery: '$deliveryLocation' },
          trips: { $sum: 1 },
          revenue: { $sum: '$revenue' },
        },
      },
      { $sort: { trips: -1 } },
      { $limit: 8 },
      {
        $project: {
          _id: 0,
          route: { $concat: ['$_id.pickup', ' → ', '$_id.delivery'] },
          trips: 1,
          revenue: 1,
        },
      },
    ]),
    DriverExpense.aggregate([
      { $match: { date: { $gte: range.from, $lte: range.to }, status: 'APPROVED' } },
      { $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
      { $project: { _id: 0, type: '$_id', amount: 1, count: 1 } },
    ]),
  ]);

  return { topDrivers, topTrucks, topRoutes, expensesByType };
}

function enumerateBuckets(range: DateRange, unit: Granularity): Date[] {
  const buckets: Date[] = [];
  const cursor = truncate(range.from, unit);
  const end = range.to.getTime();

  while (cursor.getTime() <= end && buckets.length < 400) {
    buckets.push(new Date(cursor));
    if (unit === 'day') cursor.setDate(cursor.getDate() + 1);
    else if (unit === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

/** Mirrors MongoDB's `$dateTrunc`, which works in UTC. */
function truncate(date: Date, unit: Granularity): Date {
  if (unit === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (unit === 'day') return day;
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

function formatBucketLabel(date: Date, unit: Granularity): string {
  if (unit === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function countsToMap(rows: { _id: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((sum, value) => sum + value, 0);
}

function percentChange(current: number, previous: number): number | null {
  // No baseline means no meaningful percentage to show.
  if (!previous) return current ? null : 0;
  return round(((current - previous) / Math.abs(previous)) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

