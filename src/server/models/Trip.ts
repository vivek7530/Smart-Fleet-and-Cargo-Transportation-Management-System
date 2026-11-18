import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { TRIP_STATUSES, type TripStatus } from '../types/enums';
import { shareSchema, type ShareEntry } from './share.schema';
import { staleReasonFor } from '../lib/stale-trips';

export interface TripStatusEvent {
  status: TripStatus;
  at: Date;
  by?: Types.ObjectId | null;
  note?: string;
}

export interface TripOdometerReading {
  event: 'START' | 'CLOSE';
  valueKm: number;
  recordedAt: Date;
  recordedBy: Types.ObjectId;
}

export interface TripOdometerCorrection {
  event: 'START' | 'CLOSE';
  previousKm: number;
  correctedKm: number;
  reason: string;
  correctedAt: Date;
  correctedBy: Types.ObjectId;
}

export interface TripDocument extends Document {
  _id: Types.ObjectId;
  tripCode: string;
  truck?: Types.ObjectId | null;
  driver?: Types.ObjectId | null;
  cargo: Types.ObjectId[];
  pickupLocation: string;
  deliveryLocation: string;
  distanceKm?: number;
  startDate: Date;
  expectedDeliveryDate: Date;
  actualDeliveryDate?: Date | null;
  odometerReadings: TripOdometerReading[];
  odometerCorrections: TripOdometerCorrection[];
  status: TripStatus;
  revenue: number;
  /** Rolled up from TransportationCost documents. */
  transportationCost: number;
  /** Rolled up from APPROVED DriverExpense documents. */
  driverExpenseTotal: number;
  /** Rolled up from FuelRecord documents. */
  fuelCost: number;
  notes?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledReason?: string;
  statusHistory: TripStatusEvent[];
  /**
   * Denormalised from the trip's truck, so every list and report stays a single
   * indexed query. Kept in sync whenever the truck is transferred or shared.
   */
  owner?: Types.ObjectId | null;
  sharedWith: ShareEntry[];
  /**
   * Set when a truck changed hands while this trip was already finished: the
   * money belongs to the manager named here, not to the current owner. The new
   * owner still sees the trip, but without its figures, and it is left out of
   * their report totals. `null` means the current owner earned it.
   */
  inheritedFrom?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  /** virtuals */
  totalExpenses: number;
  profit: number;
  startOverdue: boolean;
  deliveryOverdue: boolean;
}

const statusEventSchema = new Schema<TripStatusEvent>(
  {
    status: { type: String, enum: TRIP_STATUSES, required: true },
    at: { type: Date, required: true, default: () => new Date() },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const odometerReadingSchema = new Schema<TripOdometerReading>(
  {
    event: { type: String, enum: ['START', 'CLOSE'], required: true },
    valueKm: { type: Number, required: true, min: 0 },
    recordedAt: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const odometerCorrectionSchema = new Schema<TripOdometerCorrection>(
  {
    event: { type: String, enum: ['START', 'CLOSE'], required: true },
    previousKm: { type: Number, required: true, min: 0 },
    correctedKm: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    correctedAt: { type: Date, required: true, default: () => new Date() },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const tripSchema = new Schema<TripDocument>(
  {
    tripCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', default: null, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    cargo: [{ type: Schema.Types.ObjectId, ref: 'Cargo' }],
    pickupLocation: { type: String, required: true, trim: true },
    deliveryLocation: { type: String, required: true, trim: true },
    distanceKm: { type: Number, min: 0 },
    startDate: { type: Date, required: true, index: true },
    expectedDeliveryDate: { type: Date, required: true },
    actualDeliveryDate: { type: Date, default: null },
    odometerReadings: { type: [odometerReadingSchema], default: [] },
    odometerCorrections: { type: [odometerCorrectionSchema], default: [] },
    status: { type: String, enum: TRIP_STATUSES, default: 'PLANNED', index: true },
    revenue: { type: Number, default: 0, min: 0 },
    transportationCost: { type: Number, default: 0, min: 0 },
    driverExpenseTotal: { type: Number, default: 0, min: 0 },
    fuelCost: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 2000 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledReason: { type: String, trim: true },
    statusHistory: { type: [statusEventSchema], default: [] },
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    sharedWith: { type: [shareSchema], default: [] },
    inheritedFrom: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

tripSchema.virtual('totalExpenses').get(function (this: TripDocument) {
  return (this.transportationCost ?? 0) + (this.driverExpenseTotal ?? 0) + (this.fuelCost ?? 0);
});

tripSchema.virtual('profit').get(function (this: TripDocument) {
  return (this.revenue ?? 0) - ((this.transportationCost ?? 0) + (this.driverExpenseTotal ?? 0) + (this.fuelCost ?? 0));
});

// Both halves of the same rule — see `lib/stale-trips`. A trip that was due to
// leave and never did, and one that went out and never came back, are the two
// ways the fleet loses track of a truck and driver, and the dispatch gate
// refuses new work on either.
tripSchema.virtual('startOverdue').get(function (this: TripDocument) {
  return staleReasonFor(this) === 'NEVER_LEFT';
});

tripSchema.virtual('deliveryOverdue').get(function (this: TripDocument) {
  return staleReasonFor(this) === 'OVERDUE_RETURN';
});

tripSchema.index({ status: 1, startDate: -1 });
tripSchema.index({ driver: 1, status: 1, createdAt: -1 });
tripSchema.index({ truck: 1, status: 1 });
tripSchema.index({ truck: 1, status: 1, startDate: 1, expectedDeliveryDate: 1 });
tripSchema.index({ driver: 1, status: 1, startDate: 1, expectedDeliveryDate: 1 });
tripSchema.index(
  { status: 1, completedAt: 1 },
  { partialFilterExpression: { status: 'COMPLETED' } },
);
tripSchema.index(
  { driver: 1, status: 1, completedAt: 1 },
  { partialFilterExpression: { status: 'COMPLETED' } },
);
tripSchema.index({ createdAt: -1 });
// Manager-scoped trip lists.
tripSchema.index({ owner: 1, status: 1, startDate: -1 });
// Report aggregates, which also exclude inherited revenue.
tripSchema.index({ owner: 1, inheritedFrom: 1, startDate: -1 });
tripSchema.index({ 'sharedWith.user': 1 });

export const Trip: Model<TripDocument> =
  (models.Trip as Model<TripDocument> | undefined) ?? model<TripDocument>('Trip', tripSchema);
