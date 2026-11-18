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
import { accessibleTruckIds } from './ownership.service';
import { ownerScopeFor } from '../lib/ownership';

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
  const today = indiaParts(now);
  const endOfToday = endOfIndiaDay(now);

  if (preset === 'custom' && (from || to)) {
    return {
      from: from ? startOfIndiaDay(new Date(from)) : indiaDateUtc(today.year, 1, 1),
      to: to ? endOfIndiaDay(new Date(to)) : endOfToday,
    };
  }

  switch (preset) {
    case 'today':
      return { from: startOfIndiaDay(now), to: endOfToday };
    case 'week': {
      // Weeks start on Monday.
      const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
      const day = (weekday + 6) % 7;
      const monday = indiaDateUtc(today.year, today.month - 1, today.day - day);
      return { from: monday, to: endOfToday };
    }
    case 'last-month': {
      const first = indiaDateUtc(today.year, today.month - 1, 1);
      const last = new Date(indiaDateUtc(today.year, today.month, 1).getTime() - 1);
      return { from: first, to: last };
    }
    case 'year':
      return { from: indiaDateUtc(today.year, 1, 1), to: endOfToday };
    case 'all':
      return { from: indiaDateUtc(2000, 1, 1), to: endOfToday };
    case 'month':
    default:
      return { from: indiaDateUtc(today.year, today.month, 1), to: endOfToday };
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

function indiaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function indiaDateUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day) - 330 * 60_000);
}

function startOfIndiaDay(date: Date) {
  const parts = indiaParts(date);
  return indiaDateUtc(parts.year, parts.month, parts.day);
}

function endOfIndiaDay(date: Date) {
  const parts = indiaParts(date);
  return new Date(indiaDateUtc(parts.year, parts.month, parts.day + 1).getTime() - 1);
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
export async function financialsFor(range: DateRange, driverId?: string, scope: ReportScope = UNSCOPED) {
  const driverTripMatch = driverId ? { driver: new Types.ObjectId(driverId) } : {};

  const [revenue, fuel, maintenance, estimatedMaintenance, driverExpenses, transportation] = await Promise.all([
    sumOf(Trip, 'revenue', 'completedAt', range, { ...scope.tripScope, status: 'COMPLETED', ...driverTripMatch }),
    sumOf(FuelRecord, 'totalCost', 'date', range, driverId ? { driver: new Types.ObjectId(driverId) } : scope.truckScope),
    // Maintenance is a fleet-level cost, so it is excluded from a driver's own view.
    driverId ? Promise.resolve(0) : sumOf(Maintenance, 'cost', 'date', range, { ...scope.truckScope, status: 'COMPLETED' }),
    driverId ? Promise.resolve(0) : sumOf(Maintenance, 'estimatedCost', 'date', range, { ...scope.truckScope, status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } }),
    sumOf(DriverExpense, 'amount', 'date', range, {
      status: 'APPROVED',
      ...(driverId ? { driver: new Types.ObjectId(driverId) } : scope.truckScope),
    }),
    driverId ? Promise.resolve(0) : sumOf(TransportationCost, 'amount', 'date', range, scope.byTrip),
  ]);

  const totalExpenses = round(fuel + maintenance + driverExpenses + transportation);

  return {
    revenue,
    fuelExpenses: fuel,
    maintenanceExpenses: maintenance,
    estimatedMaintenanceExpenses: estimatedMaintenance,
    driverExpenses,
    transportationCosts: transportation,
    totalExpenses,
    profit: round(revenue - totalExpenses),
    margin: revenue > 0 ? round(((revenue - totalExpenses) / revenue) * 100) : 0,
  };
}

/** Fetch current and previous period totals in one indexed scan per collection. */
/**
 * `scope` restricts every collection to one manager's fleet. Each collection
 * reaches ownership by a different route — a trip is owned directly, fuel and
 * maintenance through their truck, costs and expenses through their trip — so
 * the caller resolves all three once and passes them in together.
 */
export interface ReportScope {
  tripScope: Record<string, unknown>;
  truckScope: Record<string, unknown>;
  byTrip: Record<string, unknown>;
}

const UNSCOPED: ReportScope = { tripScope: {}, truckScope: {}, byTrip: {} };

export async function financialsForPeriods(
  range: DateRange,
  previous = previousRange(range),
  granularity?: Granularity,
  scope: ReportScope = UNSCOPED,
) {
  const seriesOptions = granularity ? { granularity, countTrips: true } : undefined;
  const [revenue, fuel, maintenance, driverExpenses, transportation] = await Promise.all([
    periodTotals(Trip, 'completedAt', 'revenue', range, previous, { ...scope.tripScope, status: 'COMPLETED' }, {}, {}, seriesOptions),
    periodTotals(FuelRecord, 'date', 'totalCost', range, previous, scope.truckScope, {}, {}, seriesOptions),
    periodTotals(Maintenance, 'date', 'cost', range, previous, scope.truckScope, {
      estimatedCurrent: [
        { $match: { ...scope.truckScope, date: { $gte: range.from, $lte: range.to }, status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } } },
        { $group: { _id: null, total: { $sum: '$estimatedCost' } } },
      ],
      estimatedPrevious: [
        { $match: { ...scope.truckScope, date: { $gte: previous.from, $lte: previous.to }, status: { $in: ['SCHEDULED', 'IN_PROGRESS'] } } },
        { $group: { _id: null, total: { $sum: '$estimatedCost' } } },
      ],
    }, { status: 'COMPLETED' }, seriesOptions),
    periodTotals(DriverExpense, 'date', 'amount', range, previous, { ...scope.truckScope, status: 'APPROVED' }, {}, {}, seriesOptions),
    periodTotals(TransportationCost, 'date', 'amount', range, previous, scope.byTrip, {}, {}, seriesOptions),
  ]);

  const currentValues = {
    revenue: revenue.current,
    fuel: fuel.current,
    maintenance: maintenance.current,
    driverExpenses: driverExpenses.current,
    transportation: transportation.current,
  };
  const previousValues = {
    revenue: revenue.previous,
    fuel: fuel.previous,
    maintenance: maintenance.previous,
    driverExpenses: driverExpenses.previous,
    transportation: transportation.previous,
  };
  return {
    current: financialSummary(currentValues, maintenance.estimatedCurrent ?? 0),
    previous: financialSummary(previousValues, maintenance.estimatedPrevious ?? 0),
    ...(granularity
      ? {
          series: mergePeriodSeries(
            range,
            granularity,
            revenue.series ?? [],
            fuel.series ?? [],
            maintenance.series ?? [],
            driverExpenses.series ?? [],
            transportation.series ?? [],
          ),
        }
      : {}),
  };
}

interface PeriodSeriesPoint {
  _id: Date;
  total: number;
  trips?: number;
}

interface PeriodFacet {
  current?: { total: number }[];
  previous?: { total: number }[];
  estimatedCurrent?: { total: number }[];
  estimatedPrevious?: { total: number }[];
  series?: PeriodSeriesPoint[];
}

async function periodTotals(
  model: { aggregate: (pipeline: PipelineStage[]) => Promise<PeriodFacet[]> },
  dateField: string,
  valueField: string,
  range: DateRange,
  previous: DateRange,
  match: Record<string, unknown> = {},
  additionalFacets: Record<string, PipelineStage.FacetPipelineStage[]> = {},
  periodMatch: Record<string, unknown> = {},
  seriesOptions?: { granularity: Granularity; countTrips?: boolean },
): Promise<{
  current: number;
  previous: number;
  estimatedCurrent?: number;
  estimatedPrevious?: number;
  series?: PeriodSeriesPoint[];
}> {
  const sum = (period: DateRange): PipelineStage.FacetPipelineStage[] => [
    { $match: { [dateField]: { $gte: period.from, $lte: period.to }, ...periodMatch } },
    { $group: { _id: null, total: { $sum: `$${valueField}` } } },
  ];
  const [result] = await model.aggregate([
    { $match: { [dateField]: { $gte: previous.from, $lte: range.to }, ...match } },
    {
      $facet: {
        current: sum(range),
        previous: sum(previous),
        ...(seriesOptions
          ? {
              series: [
                {
                  $match: {
                    [dateField]: { $gte: range.from, $lte: range.to },
                    ...periodMatch,
                  },
                },
                {
                  $group: {
                    _id: {
                      $dateTrunc: {
                        date: `$${dateField}`,
                        unit: seriesOptions.granularity,
                        timezone: 'Asia/Kolkata',
                        startOfWeek: 'monday',
                      },
                    },
                    total: { $sum: `$${valueField}` },
                    ...(seriesOptions.countTrips ? { trips: { $sum: 1 } } : {}),
                  },
                },
              ] as PipelineStage.FacetPipelineStage[],
            }
          : {}),
        ...additionalFacets,
      },
    },
  ]);
  return {
    current: round(result?.current?.[0]?.total ?? 0),
    previous: round(result?.previous?.[0]?.total ?? 0),
    ...(result?.estimatedCurrent ? { estimatedCurrent: round(result.estimatedCurrent[0]?.total ?? 0) } : {}),
    ...(result?.estimatedPrevious ? { estimatedPrevious: round(result.estimatedPrevious[0]?.total ?? 0) } : {}),
    ...(result?.series ? { series: result.series } : {}),
  };
}

function mergePeriodSeries(
  range: DateRange,
  unit: Granularity,
  revenue: PeriodSeriesPoint[],
  fuel: PeriodSeriesPoint[],
  maintenance: PeriodSeriesPoint[],
  expenses: PeriodSeriesPoint[],
  transportation: PeriodSeriesPoint[],
) {
  const keyed = (rows: PeriodSeriesPoint[]) =>
    new Map(rows.map((row) => [new Date(row._id).toISOString(), row]));
  const revenueBy = keyed(revenue);
  const fuelBy = keyed(fuel);
  const maintenanceBy = keyed(maintenance);
  const expensesBy = keyed(expenses);
  const transportationBy = keyed(transportation);

  return enumerateBuckets(range, unit).map((date) => {
    const key = date.toISOString();
    const revenueRow = revenueBy.get(key);
    const revenueTotal = round(revenueRow?.total ?? 0);
    const fuelTotal = round(fuelBy.get(key)?.total ?? 0);
    const maintenanceTotal = round(maintenanceBy.get(key)?.total ?? 0);
    const expenseTotal = round(expensesBy.get(key)?.total ?? 0);
    const transportationTotal = round(transportationBy.get(key)?.total ?? 0);
    const totalExpenses = round(fuelTotal + maintenanceTotal + expenseTotal + transportationTotal);
    return {
      date: key,
      label: formatBucketLabel(date, unit),
      revenue: revenueTotal,
      fuelExpenses: fuelTotal,
      maintenanceExpenses: maintenanceTotal,
      driverExpenses: expenseTotal,
      transportationCosts: transportationTotal,
      expenses: totalExpenses,
      profit: round(revenueTotal - totalExpenses),
      trips: revenueRow?.trips ?? 0,
    };
  });
}

function financialSummary(
  values: { revenue: number; fuel: number; maintenance: number; driverExpenses: number; transportation: number },
  estimatedMaintenance = 0,
) {
  const totalExpenses = round(values.fuel + values.maintenance + values.driverExpenses + values.transportation);
  return {
    revenue: values.revenue,
    fuelExpenses: values.fuel,
    maintenanceExpenses: values.maintenance,
    estimatedMaintenanceExpenses: estimatedMaintenance,
    driverExpenses: values.driverExpenses,
    transportationCosts: values.transportation,
    totalExpenses,
    profit: round(values.revenue - totalExpenses),
    margin: values.revenue > 0 ? round(((values.revenue - totalExpenses) / values.revenue) * 100) : 0,
  };
}

/** Role-aware dashboard payload. */
export async function buildDashboard(user: UserDocument, range: DateRange) {
  if (user.role === 'DRIVER') return buildDriverDashboard(user, range);

  // Everything below is fleet-wide unless it is scoped. For a manager that
  // would report the whole company's revenue, pending spend and breakdowns as
  // if it were theirs, so each aggregate gets the same pair of predicates:
  // their trucks, and — for anything that counts money — only the trips they
  // actually earned, leaving out those inherited from a previous owner.
  const truckIds = await accessibleTruckIds(user);
  const truckScope = truckIds === null ? {} : { truck: { $in: truckIds } };
  const ownScope = truckIds === null ? {} : { ...ownerScopeFor(user), inheritedFrom: null };
  const tripIds =
    truckIds === null ? null : (await Trip.find(ownScope).select('_id').lean()).map((t) => t._id);
  const tripScope = tripIds === null ? {} : { _id: { $in: tripIds } };
  const byTrip = tripIds === null ? {} : { trip: { $in: tripIds } };

  const previous = previousRange(range);

  const [
    fleet,
    driverCounts,
    tripCounts,
    overdueStarts,
    tripsInRange,
    previousTrips,
    financialPeriods,
    pendingExpenses,
    openBreakdowns,
    expiringDocuments,
    recentTrips,
  ] = await Promise.all([
    Truck.aggregate<{ _id: string; count: number }>([
      { $match: truckIds === null ? {} : { _id: { $in: truckIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { role: 'DRIVER', ...(truckIds === null ? {} : { manager: user._id }) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Trip.aggregate<{ _id: string; count: number }>([
      { $match: tripScope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Trip.countDocuments({
      ...tripScope,
      status: { $in: ['PLANNED', 'ASSIGNED', 'LOADING'] },
      startDate: { $lt: resolveRange('today').from },
    }),
    Trip.countDocuments({ ...tripScope, startDate: { $gte: range.from, $lte: range.to } }),
    Trip.countDocuments({ ...tripScope, startDate: { $gte: previous.from, $lte: previous.to } }),
    financialsForPeriods(range, previous, pickGranularity(range), { tripScope, truckScope, byTrip }),
    DriverExpense.aggregate<{ count: number; amount: number }>([
      { $match: { ...truckScope, status: 'PENDING' } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    BreakdownReport.countDocuments({ ...truckScope, status: { $nin: ['RESOLVED', 'CANCELLED'] } }),
    DocumentRecord.countDocuments({
      ...truckScope,
      expiryDate: { $ne: null, $lte: new Date(Date.now() + 30 * 86_400_000) },
      status: { $ne: 'REJECTED' },
    }),
    Trip.find(tripScope)
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('truck', 'truckNumber')
      .populate('driver', 'name avatarColor'),
  ]);

  const byTruckStatus = countsToMap(fleet);
  const byDriverStatus = countsToMap(driverCounts);
  const byTripStatus = countsToMap(tripCounts);
  const financials = financialPeriods.current;
  const previousFinancials = financialPeriods.previous;

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
      overdueStarts,
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
    series: financialPeriods.series ?? [],
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
export async function timeSeries(range: DateRange, granularity: Granularity, driverId?: string, scope: ReportScope = UNSCOPED) {
  const unit = granularity;
  const driverMatch = driverId ? { driver: new Types.ObjectId(driverId) } : {};

  const bucket = (dateField: string) => ({
    $dateTrunc: { date: `$${dateField}`, unit, timezone: 'Asia/Kolkata', startOfWeek: 'monday' },
  });

  const [trips, fuel, maintenance, expenses, transport] = await Promise.all([
    Trip.aggregate<{ _id: Date; revenue: number; trips: number }>([
      {
        $match: {
          ...scope.tripScope,
          completedAt: { $gte: range.from, $lte: range.to },
          status: 'COMPLETED',
          ...driverMatch,
        },
      },
      { $group: { _id: bucket('completedAt'), revenue: { $sum: '$revenue' }, trips: { $sum: 1 } } },
    ]),
    FuelRecord.aggregate<{ _id: Date; total: number }>([
      { $match: { ...scope.truckScope, date: { $gte: range.from, $lte: range.to }, ...driverMatch } },
      { $group: { _id: bucket('date'), total: { $sum: '$totalCost' } } },
    ]),
    driverId
      ? Promise.resolve([] as { _id: Date; total: number }[])
      : Maintenance.aggregate<{ _id: Date; total: number }>([
          { $match: { ...scope.truckScope, date: { $gte: range.from, $lte: range.to }, status: 'COMPLETED' } },
          { $group: { _id: bucket('date'), total: { $sum: '$cost' } } },
        ]),
    DriverExpense.aggregate<{ _id: Date; total: number }>([
      { $match: { ...scope.truckScope, date: { $gte: range.from, $lte: range.to }, status: 'APPROVED', ...driverMatch } },
      { $group: { _id: bucket('date'), total: { $sum: '$amount' } } },
    ]),
    driverId
      ? Promise.resolve([] as { _id: Date; total: number }[])
      : TransportationCost.aggregate<{ _id: Date; total: number }>([
          { $match: { ...scope.byTrip, date: { $gte: range.from, $lte: range.to } } },
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
/**
 * Resolves one user's report scope once, so every aggregate in a request shares
 * it. An administrator gets the unrestricted scope.
 */
export async function reportScopeFor(user: UserDocument): Promise<ReportScope> {
  const truckIds = await accessibleTruckIds(user);
  if (truckIds === null) return UNSCOPED;
  const ownScope = { ...ownerScopeFor(user), inheritedFrom: null };
  const tripIds = (await Trip.find(ownScope).select('_id').lean()).map((trip) => trip._id);
  return {
    tripScope: { _id: { $in: tripIds } },
    truckScope: { truck: { $in: truckIds } },
    byTrip: { trip: { $in: tripIds } },
  };
}

export async function buildLeaderboards(range: DateRange, scope: ReportScope = UNSCOPED) {
  const match = { ...scope.tripScope, completedAt: { $gte: range.from, $lte: range.to }, status: 'COMPLETED' };

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
      { $match: { ...scope.truckScope, date: { $gte: range.from, $lte: range.to }, status: 'APPROVED' } },
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
    if (unit === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (unit === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

/** Mirrors MongoDB's `$dateTrunc` configured for Asia/Kolkata. */
function truncate(date: Date, unit: Granularity): Date {
  const parts = indiaParts(date);
  if (unit === 'month') return indiaDateUtc(parts.year, parts.month, 1);
  if (unit === 'day') return indiaDateUtc(parts.year, parts.month, parts.day);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = (day.getUTCDay() + 6) % 7;
  return indiaDateUtc(parts.year, parts.month, parts.day - weekday);
}

function formatBucketLabel(date: Date, unit: Granularity): string {
  if (unit === 'month') {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
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

