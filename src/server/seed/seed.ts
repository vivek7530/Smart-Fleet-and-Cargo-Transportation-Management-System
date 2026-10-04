/**
 * Development seed.
 *
 *   npm run seed          → adds demo data if the database is empty
 *   npm run seed:reset    → wipes the collections first, then re-seeds
 *
 * The dataset is deterministic (fixed PRNG seed) so repeated runs produce the
 * same fleet, which makes screenshots and manual testing reproducible.
 */
import mongoose, { Types } from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../db';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/password';
import { ensureInitialAdmin } from '../services/bootstrap.service';
import { generateInvitationToken, invitationExpiry, buildInvitationLink } from '../services/invitation.service';

import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import { Truck } from '../models/Truck';
import { Cargo } from '../models/Cargo';
import { Trip } from '../models/Trip';
import { FuelRecord } from '../models/FuelRecord';
import { Maintenance } from '../models/Maintenance';
import { TransportationCost } from '../models/TransportationCost';
import { DriverExpense } from '../models/DriverExpense';
import { DocumentRecord } from '../models/DocumentRecord';
import { BreakdownReport } from '../models/BreakdownReport';
import { Notification } from '../models/Notification';
import { AuditLog } from '../models/AuditLog';
import { Counter, formatCode } from '../models/Counter';

import {
  BREAKDOWN_TEMPLATES,
  CARGO_TEMPLATES,
  CONSIGNEES,
  DRIVERS,
  EXPENSE_TEMPLATES,
  FUEL_STATIONS,
  INSURERS,
  MAINTENANCE_JOBS,
  MANAGERS,
  ROUTES,
  SERVICE_PROVIDERS,
  SHIPPERS,
  STATE_CODES,
  TRANSPORT_COST_TEMPLATES,
  TRUCK_MODELS,
} from './data';

const DEMO_PASSWORD = 'Password123!';

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers
// ---------------------------------------------------------------------------
let seedState = 0x9e3779b9;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const money = (min: number, max: number) => Math.round((rand() * (max - min) + min) / 10) * 10;
const decimal = (min: number, max: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round((rand() * (max - min) + min) * factor) / factor;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (probability: number) => rand() < probability;

const DAY = 86_400_000;
const daysAgo = (days: number, hour = 9) => {
  const date = new Date(Date.now() - days * DAY);
  date.setHours(hour, int(0, 59), 0, 0);
  return date;
};
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

// ---------------------------------------------------------------------------

/** Shape of a truck row before it is handed to Mongoose. */
interface SeedTruck {
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  fuelType: string;
  status: string;
  assignedDriver: Types.ObjectId | null;
  odometerKm: number;
  mileageKmPerLitre: number;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiry: Date;
  registrationExpiry: Date;
  fitnessExpiry: Date;
  permitExpiry: Date;
  purchaseDate: Date;
  purchasePrice: number;
  purchaseVendor: string;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

async function resetCollections() {
  // Heterogeneous list of models — the loose type keeps `deleteMany` callable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: mongoose.Model<any>[] = [
    User,
    Invitation,
    Truck,
    Cargo,
    Trip,
    FuelRecord,
    Maintenance,
    TransportationCost,
    DriverExpense,
    DocumentRecord,
    BreakdownReport,
    Notification,
    AuditLog,
    Counter,
  ];
  await Promise.all(models.map((model) => model.deleteMany({})));
  logger.warn('All collections cleared');
}

async function seed() {
  const reset = process.argv.includes('--reset');

  await connectToDatabase();
  if (reset) await resetCollections();

  const existingTrucks = await Truck.countDocuments();
  if (existingTrucks > 0 && !reset) {
    logger.warn(`Database already holds ${existingTrucks} trucks — nothing to do.`);
    logger.info('Run "npm run seed:reset" to wipe and rebuild the demo dataset.');
    await disconnectFromDatabase();
    return;
  }

  // -------------------------------------------------------------------------
  // 1. People
  // -------------------------------------------------------------------------
  await ensureInitialAdmin();
  const admin = (await User.findOne({ role: 'ADMIN' }).sort({ createdAt: 1 }))!;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const managers = await User.insertMany(
    MANAGERS.map((manager, index) => ({
      ...manager,
      passwordHash,
      role: 'MANAGER',
      status: 'ACTIVE',
      invitationStatus: 'ACCEPTED',
      invitedBy: admin._id,
      lockedContactField: 'email',
      avatarColor: ['blue', 'emerald', 'amber'][index],
      createdAt: daysAgo(300 - index * 10),
    })),
  );

  const drivers = await User.insertMany(
    DRIVERS.map((driver, index) => ({
      ...driver,
      passwordHash,
      role: 'DRIVER',
      status: 'ACTIVE',
      invitationStatus: 'ACCEPTED',
      invitedBy: managers[index % managers.length]._id,
      // Every driver here was invited by mobile, so mobile is their locked contact.
      lockedContactField: 'mobile',
      email: index % 3 === 0 ? `${driver.name.split(' ')[0].toLowerCase()}.driver@cargoentry.dev` : undefined,
      licenseExpiry: addDays(new Date(), int(40, 900)),
      designation: 'Long-haul Driver',
      avatarColor: ['violet', 'cyan', 'rose', 'teal', 'indigo'][index % 5],
      createdAt: daysAgo(280 - index * 7),
    })),
  );

  logger.success(`Created ${managers.length} managers and ${drivers.length} drivers`);

  // Two invitations left deliberately pending so the invite flow can be explored.
  const pendingInvites = await createPendingInvitations(admin._id);

  // -------------------------------------------------------------------------
  // 2. Fleet
  // -------------------------------------------------------------------------
  const trucks: SeedTruck[] = [];
  for (let index = 0; index < 20; index += 1) {
    const spec = TRUCK_MODELS[index % TRUCK_MODELS.length];
    const state = STATE_CODES[index % STATE_CODES.length];
    const truckNumber = `${state}${String(int(1, 48)).padStart(2, '0')}${letters()}${String(1000 + index * 37).slice(0, 4)}`;
    const purchaseDate = daysAgo(int(400, 2_200));

    // The first ten trucks each carry a permanent driver.
    const assignedDriver = index < drivers.length ? drivers[index]._id : null;

    trucks.push({
      truckNumber,
      registrationNumber: truckNumber,
      make: spec.make,
      model: spec.model,
      year: new Date(purchaseDate).getFullYear(),
      capacityTons: spec.capacityTons,
      fuelType: 'DIESEL',
      status: assignedDriver ? 'ASSIGNED' : 'AVAILABLE',
      assignedDriver,
      odometerKm: int(45_000, 480_000),
      mileageKmPerLitre: spec.mileage,
      insuranceProvider: pick(INSURERS),
      insurancePolicyNumber: `POL/${int(2023, 2025)}/${int(100000, 999999)}`,
      insuranceExpiry: addDays(new Date(), int(-20, 400)),
      registrationExpiry: addDays(new Date(), int(60, 1_800)),
      fitnessExpiry: addDays(new Date(), int(-10, 500)),
      permitExpiry: addDays(new Date(), int(30, 700)),
      purchaseDate,
      purchasePrice: spec.price,
      purchaseVendor: `${spec.make} Authorised Dealership`,
      createdBy: pick(managers)._id,
      createdAt: purchaseDate,
    });
  }

  // A slice of the fleet is off the road, as it always is in reality.
  trucks[15].status = 'MAINTENANCE';
  trucks[16].status = 'MAINTENANCE';
  trucks[19].status = 'INACTIVE';
  trucks[19].notes = 'Awaiting disposal — engine beyond economical repair.';

  const savedTrucks = await Truck.insertMany(trucks);
  await Counter.findByIdAndUpdate('TRK', { seq: savedTrucks.length }, { upsert: true });
  logger.success(`Created ${savedTrucks.length} trucks`);

  // -------------------------------------------------------------------------
  // 3. Trips, cargo and every cost attached to them
  // -------------------------------------------------------------------------
  const driveableTrucks = savedTrucks.filter((truck) => truck.assignedDriver);

  // 30 trips: a long completed history plus a live snapshot of today's operation.
  const plan: { status: string; startOffset: number }[] = [
    ...Array.from({ length: 22 }, (_, index) => ({
      status: 'COMPLETED',
      startOffset: 300 - index * 13,
    })),
    { status: 'CANCELLED', startOffset: 96 },
    { status: 'IN_TRANSIT', startOffset: 3 },
    { status: 'IN_TRANSIT', startOffset: 2 },
    { status: 'LOADING', startOffset: 1 },
    { status: 'ASSIGNED', startOffset: -1 },
    { status: 'ASSIGNED', startOffset: -3 },
    { status: 'PLANNED', startOffset: -6 },
    { status: 'PLANNED', startOffset: -11 },
  ];

  let cargoSeq = 0;
  let tripSeq = 0;
  const createdTrips = [];
  const busyTrucks = new Set<string>();
  const auditEntries: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];

  for (const step of plan) {
    tripSeq += 1;
    const route = pick(ROUTES);
    const isLive = ['IN_TRANSIT', 'LOADING', 'ASSIGNED'].includes(step.status);

    // A live trip needs a truck that is not already committed elsewhere.
    const candidates = driveableTrucks.filter(
      (truck) => !isLive || (!busyTrucks.has(String(truck._id)) && truck.status !== 'MAINTENANCE'),
    );
    const truck = pick(candidates.length ? candidates : driveableTrucks);
    if (isLive) busyTrucks.add(String(truck._id));

    const driver = drivers.find((d) => String(d._id) === String(truck.assignedDriver)) ?? pick(drivers);
    const manager = pick(managers);

    const startDate = daysAgo(step.startOffset, int(5, 11));
    const transitDays = Math.max(1, Math.round(route.km / 480));
    const expectedDeliveryDate = addDays(startDate, transitDays + 1);
    const revenue = money(route.revenue[0], route.revenue[1]);

    // --- cargo ------------------------------------------------------------
    const cargoCount = route.km > 700 ? int(1, 2) : 1;
    const cargoDocs = [];
    for (let c = 0; c < cargoCount; c += 1) {
      cargoSeq += 1;
      const template = pick(CARGO_TEMPLATES);
      cargoDocs.push({
        _id: new Types.ObjectId(),
        cargoCode: formatCode('CRG', cargoSeq),
        description: template.description,
        type: template.type,
        weightTons: decimal(template.weight[0], Math.min(template.weight[1], truck.capacityTons)),
        units: int(20, 640),
        declaredValue: money(template.value[0], template.value[1]),
        shipperName: pick(SHIPPERS),
        shipperContact: `+9198${int(10000000, 99999999)}`,
        consigneeName: pick(CONSIGNEES),
        consigneeContact: `+9197${int(10000000, 99999999)}`,
        origin: route.from,
        destination: route.to,
        status: cargoStatusFor(step.status),
        handlingInstructions: chance(0.4) ? 'Keep upright. Do not stack beyond three tiers.' : undefined,
        createdBy: manager._id,
        createdAt: addDays(startDate, -1),
      });
    }
    await Cargo.insertMany(cargoDocs);

    // --- trip -------------------------------------------------------------
    const tripId = new Types.ObjectId();
    const tripCode = formatCode('TRP', tripSeq);
    const completedAt = step.status === 'COMPLETED' ? addDays(startDate, transitDays + int(0, 1)) : null;

    const statusHistory: Record<string, unknown>[] = [
      { status: 'PLANNED', at: addDays(startDate, -2), by: manager._id, note: 'Trip created' },
    ];
    if (step.status !== 'PLANNED') {
      statusHistory.push({ status: 'ASSIGNED', at: addDays(startDate, -1), by: manager._id, note: 'Truck and driver assigned' });
    }
    if (['LOADING', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(step.status)) {
      statusHistory.push({ status: 'LOADING', at: startDate, by: driver._id, note: 'Loading started at origin' });
    }
    if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(step.status)) {
      statusHistory.push({ status: 'IN_TRANSIT', at: addDays(startDate, 0.2), by: driver._id, note: 'Departed origin' });
    }
    if (step.status === 'COMPLETED') {
      statusHistory.push({ status: 'DELIVERED', at: completedAt!, by: driver._id, note: 'Delivered and POD collected' });
      statusHistory.push({ status: 'COMPLETED', at: completedAt!, by: manager._id, note: 'Trip completed' });
    }
    if (step.status === 'CANCELLED') {
      statusHistory.push({ status: 'CANCELLED', at: startDate, by: manager._id, note: 'Consignor withdrew the booking' });
    }

    await Trip.create({
      _id: tripId,
      tripCode,
      truck: truck._id,
      driver: driver._id,
      cargo: cargoDocs.map((doc) => doc._id),
      pickupLocation: route.from,
      deliveryLocation: route.to,
      distanceKm: route.km,
      startDate,
      expectedDeliveryDate,
      actualDeliveryDate: completedAt,
      status: step.status,
      revenue: step.status === 'CANCELLED' ? 0 : revenue,
      notes: chance(0.3) ? 'Consignor requested delivery before 18:00 local time.' : undefined,
      startedAt: ['IN_TRANSIT', 'COMPLETED'].includes(step.status) ? addDays(startDate, 0.2) : null,
      completedAt,
      cancelledReason: step.status === 'CANCELLED' ? 'Consignor withdrew the booking' : undefined,
      statusHistory,
      createdBy: manager._id,
      createdAt: addDays(startDate, -2),
    });

    await Cargo.updateMany({ _id: { $in: cargoDocs.map((d) => d._id) } }, { trip: tripId });
    createdTrips.push({ id: tripId, tripCode, truck, driver, manager, startDate, route, status: step.status, transitDays });

    if (step.status === 'CANCELLED' || step.status === 'PLANNED') {
      auditEntries.push(
        auditEntry(manager, 'TRIP_CREATED', `${manager.name} created trip ${tripCode} (${route.from} → ${route.to})`, 'Trip', tripId, addDays(startDate, -2)),
      );
      continue;
    }

    // --- fuel -------------------------------------------------------------
    const fuelStops = Math.max(1, Math.round(route.km / 420));
    for (let f = 0; f < fuelStops; f += 1) {
      const litres = decimal(90, Math.min(320, route.km / 3), 1);
      const pricePerLitre = decimal(88, 98, 2);
      await FuelRecord.create({
        truck: truck._id,
        driver: driver._id,
        trip: tripId,
        date: addDays(startDate, f * (transitDays / fuelStops)),
        litres,
        pricePerLitre,
        totalCost: Math.round(litres * pricePerLitre * 100) / 100,
        odometerKm: truck.odometerKm - int(0, 5_000),
        station: pick(FUEL_STATIONS),
        location: f === 0 ? route.from : 'En route — highway',
        paymentMode: chance(0.7) ? 'FUEL_CARD' : 'CASH',
        createdBy: driver._id,
        createdAt: addDays(startDate, f),
      });
    }

    // --- transportation costs --------------------------------------------
    const costCount = int(3, 5);
    const usedCostTypes = new Set<string>();
    for (let c = 0; c < costCount; c += 1) {
      const template = pick(TRANSPORT_COST_TEMPLATES);
      if (usedCostTypes.has(template.type)) continue;
      usedCostTypes.add(template.type);

      await TransportationCost.create({
        trip: tripId,
        truck: truck._id,
        type: template.type,
        amount: money(template.amount[0], template.amount[1]),
        date: addDays(startDate, int(0, transitDays)),
        description: template.description,
        vendor: chance(0.5) ? pick(SERVICE_PROVIDERS) : undefined,
        createdBy: manager._id,
        createdAt: addDays(startDate, int(0, transitDays)),
      });
    }

    // --- driver expenses --------------------------------------------------
    const expenseCount = int(2, 4);
    for (let e = 0; e < expenseCount; e += 1) {
      const template = pick(EXPENSE_TEMPLATES);
      const submittedAt = addDays(startDate, int(0, transitDays));

      // Historic trips are fully settled; live trips still have claims in review.
      let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
      if (step.status === 'COMPLETED') status = chance(0.85) ? 'APPROVED' : 'REJECTED';
      else if (chance(0.35)) status = 'APPROVED';

      const amount = money(template.amount[0], template.amount[1]);
      const expense = await DriverExpense.create({
        driver: driver._id,
        trip: tripId,
        truck: truck._id,
        type: template.type,
        amount,
        date: submittedAt,
        description: template.description,
        status,
        reviewedBy: status === 'PENDING' ? null : manager._id,
        reviewedAt: status === 'PENDING' ? null : addDays(submittedAt, 1),
        rejectionReason:
          status === 'REJECTED' ? 'Receipt was not legible — please resubmit with a clear photo.' : undefined,
        createdAt: submittedAt,
      });

      if (status !== 'PENDING') {
        auditEntries.push(
          auditEntry(
            manager,
            status === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
            `${manager.name} ${status.toLowerCase()} ${driver.name}'s ₹${amount} ${template.type.toLowerCase()} expense`,
            'DriverExpense',
            expense._id,
            addDays(submittedAt, 1),
          ),
        );
      } else {
        notifications.push({
          user: pick(managers)._id,
          type: 'EXPENSE_SUBMITTED',
          title: 'New expense awaiting review',
          message: `${driver.name} submitted a ₹${amount} ${template.type.toLowerCase()} expense.`,
          link: '/expenses',
          entity: 'DriverExpense',
          entityId: expense._id,
          read: false,
          createdAt: submittedAt,
        });
      }
    }

    // --- proof of delivery -------------------------------------------------
    if (step.status === 'COMPLETED') {
      await DocumentRecord.create({
        name: `Proof of delivery — ${tripCode}`,
        type: 'PROOF_OF_DELIVERY',
        ownerType: 'TRIP',
        trip: tripId,
        truck: truck._id,
        driver: driver._id,
        referenceNumber: `POD/${tripCode}/${int(1000, 9999)}`,
        issuedBy: 'Consignee',
        issueDate: completedAt,
        status: 'VERIFIED',
        addedBy: driver._id,
        verifiedBy: manager._id,
        verifiedAt: addDays(completedAt!, 1),
        createdAt: completedAt!,
      });
    }

    auditEntries.push(
      auditEntry(manager, 'TRIP_CREATED', `${manager.name} created trip ${tripCode} (${route.from} → ${route.to})`, 'Trip', tripId, addDays(startDate, -2)),
      auditEntry(driver, 'TRIP_STARTED', `${driver.name} started trip ${tripCode}`, 'Trip', tripId, addDays(startDate, 0.2)),
    );
    if (step.status === 'COMPLETED') {
      auditEntries.push(
        auditEntry(manager, 'TRIP_COMPLETED', `${manager.name} completed trip ${tripCode}`, 'Trip', tripId, completedAt!),
      );
    }
  }

  await Counter.findByIdAndUpdate('TRP', { seq: tripSeq }, { upsert: true });
  await Counter.findByIdAndUpdate('CRG', { seq: cargoSeq }, { upsert: true });
  logger.success(`Created ${createdTrips.length} trips with cargo, fuel, costs and expenses`);

  // Roll the child records up onto each trip.
  await Promise.all(createdTrips.map((trip) => rollUpTripTotals(String(trip.id))));

  // Live trips put their truck on the road.
  await Truck.updateMany(
    { _id: { $in: [...busyTrucks].map((id) => new Types.ObjectId(id)) }, status: { $ne: 'MAINTENANCE' } },
    { status: 'IN_TRIP' },
  );

  // -------------------------------------------------------------------------
  // 4. Maintenance history
  // -------------------------------------------------------------------------
  const maintenanceDocs = [];
  for (const truck of savedTrucks) {
    for (let m = 0; m < int(1, 4); m += 1) {
      const job = pick(MAINTENANCE_JOBS);
      const date = daysAgo(int(10, 420));
      maintenanceDocs.push({
        truck: truck._id,
        type: job.type,
        description: job.description,
        cost: money(job.cost[0], job.cost[1]),
        date,
        serviceProvider: pick(SERVICE_PROVIDERS),
        nextServiceDate: addDays(date, int(90, 220)),
        odometerKm: truck.odometerKm - int(1_000, 60_000),
        status: truck.status === 'MAINTENANCE' && m === 0 ? 'IN_PROGRESS' : 'COMPLETED',
        createdBy: pick(managers)._id,
        createdAt: date,
      });
    }
  }
  await Maintenance.insertMany(maintenanceDocs);
  logger.success(`Created ${maintenanceDocs.length} maintenance records`);

  // -------------------------------------------------------------------------
  // 5. Fleet + driver documents
  // -------------------------------------------------------------------------
  const documents: Record<string, unknown>[] = [];
  for (const truck of savedTrucks) {
    documents.push(
      truckDocument(truck, 'INSURANCE', `Insurance policy — ${truck.truckNumber}`, truck.insuranceExpiry, admin._id),
      truckDocument(truck, 'REGISTRATION', `RC book — ${truck.truckNumber}`, truck.registrationExpiry, admin._id),
      truckDocument(truck, 'FITNESS', `Fitness certificate — ${truck.truckNumber}`, truck.fitnessExpiry, admin._id),
    );
  }
  for (const driver of drivers) {
    documents.push({
      name: `Driving licence — ${driver.name}`,
      type: 'LICENSE',
      ownerType: 'DRIVER',
      driver: driver._id,
      referenceNumber: driver.licenseNumber,
      issuedBy: 'Regional Transport Office',
      expiryDate: driver.licenseExpiry,
      status: chance(0.85) ? 'VERIFIED' : 'PENDING',
      addedBy: driver._id,
      verifiedBy: admin._id,
      verifiedAt: daysAgo(int(20, 200)),
      createdAt: daysAgo(int(30, 260)),
    });
  }
  await DocumentRecord.insertMany(documents);
  logger.success(`Created ${documents.length} truck and driver documents`);

  // -------------------------------------------------------------------------
  // 6. Breakdown reports
  // -------------------------------------------------------------------------
  const breakdowns = [];
  for (let b = 0; b < 6; b += 1) {
    const template = BREAKDOWN_TEMPLATES[b];
    const truck = savedTrucks[b + 2];
    const driver = drivers.find((d) => String(d._id) === String(truck.assignedDriver)) ?? drivers[b];
    const reportedAt = daysAgo(int(1, 120), int(6, 20));
    const resolved = b > 1;

    breakdowns.push({
      reportCode: formatCode('BRK', b + 1),
      truck: truck._id,
      driver: driver._id,
      location: `${pick(ROUTES).from} — km ${int(20, 780)} marker`,
      description: template.description,
      severity: template.severity,
      status: resolved ? 'RESOLVED' : b === 0 ? 'REPORTED' : 'IN_PROGRESS',
      reportedAt,
      acknowledgedBy: b === 0 ? null : pick(managers)._id,
      acknowledgedAt: b === 0 ? null : addDays(reportedAt, 0.1),
      resolutionNotes: resolved ? 'Roadside assistance dispatched, vehicle repaired and released the same day.' : undefined,
      resolvedBy: resolved ? pick(managers)._id : null,
      resolvedAt: resolved ? addDays(reportedAt, 1) : null,
      createdAt: reportedAt,
    });
  }
  await BreakdownReport.insertMany(breakdowns);
  await Counter.findByIdAndUpdate('BRK', { seq: breakdowns.length }, { upsert: true });
  logger.success(`Created ${breakdowns.length} breakdown reports`);

  // -------------------------------------------------------------------------
  // 7. Notifications + audit trail
  // -------------------------------------------------------------------------
  for (const driver of drivers.slice(0, 6)) {
    notifications.push({
      user: driver._id,
      type: 'TRIP_ASSIGNED',
      title: 'New trip assigned',
      message: 'A new trip has been added to your schedule. Open My Trips for the details.',
      link: '/my-trips',
      read: chance(0.4),
      createdAt: daysAgo(int(1, 12)),
    });
  }
  for (const manager of managers) {
    notifications.push({
      user: manager._id,
      type: 'BREAKDOWN_REPORTED',
      title: 'Breakdown reported',
      message: 'A driver has reported a breakdown that needs attention.',
      link: '/breakdowns',
      read: false,
      createdAt: daysAgo(int(1, 6)),
    });
  }
  notifications.push({
    user: admin._id,
    type: 'DOCUMENT_EXPIRING',
    title: 'Documents expiring soon',
    message: 'Several vehicle documents expire within the next 30 days.',
    link: '/documents?expiring=30',
    read: false,
    createdAt: daysAgo(1),
  });
  await Notification.insertMany(notifications);

  auditEntries.push(
    auditEntry(admin, 'ADMIN_BOOTSTRAPPED', `Initial administrator account created for ${admin.email}`, 'User', admin._id, daysAgo(320)),
    ...managers.map((manager, index) =>
      auditEntry(admin, 'USER_INVITED', `${admin.name} invited ${manager.name} as Manager via email`, 'User', manager._id, daysAgo(300 - index * 10)),
    ),
    ...drivers.map((driver, index) =>
      auditEntry(
        managers[index % managers.length],
        'USER_INVITED',
        `${managers[index % managers.length].name} invited ${driver.name} as Driver via mobile`,
        'User',
        driver._id,
        daysAgo(280 - index * 7),
      ),
    ),
    ...savedTrucks.slice(0, 10).map((truck, index) =>
      auditEntry(
        pick(managers),
        'TRUCK_DRIVER_ASSIGNED',
        `Truck ${truck.truckNumber} assigned to ${drivers[index].name}`,
        'Truck',
        truck._id,
        daysAgo(int(60, 250)),
      ),
    ),
  );
  await AuditLog.insertMany(auditEntries);
  logger.success(`Created ${notifications.length} notifications and ${auditEntries.length} audit entries`);

  // -------------------------------------------------------------------------
  printSummary(pendingInvites);
  await disconnectFromDatabase();
}

async function createPendingInvitations(adminId: Types.ObjectId) {
  const specs = [
    { name: 'Neha Bhatt', email: 'neha.bhatt@cargoentry.dev', mobile: null, role: 'MANAGER', channel: 'EMAIL' as const },
    { name: 'Imran Sheikh', email: null, mobile: '+919833440021', role: 'DRIVER', channel: 'MOBILE' as const },
  ];

  const links: { name: string; role: string; channel: string; link: string }[] = [];

  for (const spec of specs) {
    const user = await User.create({
      name: spec.name,
      email: spec.email ?? undefined,
      mobile: spec.mobile ?? undefined,
      role: spec.role,
      status: 'INVITED',
      invitationStatus: 'PENDING',
      invitedBy: adminId,
      lockedContactField: spec.channel === 'EMAIL' ? 'email' : 'mobile',
      avatarColor: 'amber',
    });

    const { token, tokenHash, preview } = generateInvitationToken();
    await Invitation.create({
      name: spec.name,
      email: spec.email,
      mobile: spec.mobile,
      role: spec.role,
      channel: spec.channel,
      tokenHash,
      tokenPreview: preview,
      invitedBy: adminId,
      user: user._id,
      status: 'PENDING',
      expiresAt: invitationExpiry(),
    });

    links.push({ name: spec.name, role: spec.role, channel: spec.channel, link: buildInvitationLink(token) });
  }

  return links;
}

/** Mirrors `recalculateTripFinancials` without importing the request-bound service. */
async function rollUpTripTotals(tripId: string) {
  const _id = new Types.ObjectId(tripId);
  const [costs, expenses, fuel] = await Promise.all([
    TransportationCost.aggregate([{ $match: { trip: _id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    DriverExpense.aggregate([
      { $match: { trip: _id, status: 'APPROVED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FuelRecord.aggregate([{ $match: { trip: _id } }, { $group: { _id: null, total: { $sum: '$totalCost' } } }]),
  ]);

  await Trip.updateOne(
    { _id },
    {
      transportationCost: round(costs[0]?.total ?? 0),
      driverExpenseTotal: round(expenses[0]?.total ?? 0),
      fuelCost: round(fuel[0]?.total ?? 0),
    },
  );
}

const ISSUERS: Record<string, string> = {
  INSURANCE: 'ICICI Lombard General Insurance',
  REGISTRATION: 'Regional Transport Office',
  FITNESS: 'Regional Transport Office',
  PERMIT: 'State Transport Authority',
};

function truckDocument(
  truck: { _id: Types.ObjectId; truckNumber: string },
  type: string,
  name: string,
  expiryDate: Date | null | undefined,
  addedBy: Types.ObjectId,
) {
  return {
    name,
    type,
    ownerType: 'TRUCK',
    truck: truck._id,
    referenceNumber: `${type.slice(0, 3)}/${int(2023, 2025)}/${int(100000, 999999)}`,
    issuedBy: ISSUERS[type] ?? 'Issuing authority',
    expiryDate: expiryDate ?? null,
    status: 'VERIFIED',
    addedBy,
    verifiedBy: addedBy,
    verifiedAt: daysAgo(int(10, 300)),
    createdAt: daysAgo(int(20, 400)),
  };
}

function auditEntry(
  actor: { _id: Types.ObjectId; name: string; role: string },
  action: string,
  summary: string,
  entity: string,
  entityId: Types.ObjectId,
  createdAt: Date,
) {
  return {
    user: actor._id,
    userName: actor.name,
    userRole: actor.role,
    action,
    summary,
    entity,
    entityId,
    ip: '127.0.0.1',
    userAgent: 'CargoEntry Seed Script',
    createdAt,
  };
}

function cargoStatusFor(tripStatus: string): string {
  switch (tripStatus) {
    case 'COMPLETED':
      return 'DELIVERED';
    case 'IN_TRANSIT':
      return 'IN_TRANSIT';
    case 'LOADING':
      return 'LOADED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'ASSIGNED';
  }
}

function letters() {
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return `${pick([...alphabet])}${pick([...alphabet])}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function printSummary(invites: { name: string; role: string; channel: string; link: string }[]) {
  const line = '——'.repeat(74);
  console.log(`\n${line}`);
  console.log('  CargoEntry demo data is ready');
  console.log(line);
  console.log('  Sign in with any of these accounts:\n');
  console.log(`    ADMIN     ${env.admin.email}  /  ${env.admin.password}`);
  console.log(`    MANAGER   ${MANAGERS[0].email}  /  ${DEMO_PASSWORD}`);
  console.log(`    DRIVER    ${DRIVERS[0].mobile}  /  ${DEMO_PASSWORD}   (sign in with the mobile number)`);
  console.log('\n  Every seeded manager and driver shares the password above.');
  console.log('\n  Two invitations are left pending so you can try the registration flow:');
  for (const invite of invites) {
    console.log(`\n    ${invite.role} · invited by ${invite.channel.toLowerCase()} · ${invite.name}`);
    console.log(`    ${invite.link}`);
  }
  console.log(`\n  Browse the data in MongoDB Compass: ${env.mongoUri}`);
  console.log(`${line}\n`);
}

seed()
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error('Seeding failed', error);
    await mongoose.connection.close().catch(() => undefined);
    process.exit(1);
  });

