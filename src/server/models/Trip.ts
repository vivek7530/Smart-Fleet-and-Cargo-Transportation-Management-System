import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { TRIP_STATUSES, type TripStatus } from '../types/enums';

export interface TripStatusEvent {
  status: TripStatus;
  at: Date;
  by?: Types.ObjectId | null;
  note?: string;
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
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  /** virtuals */
  totalExpenses: number;
  profit: number;
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
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
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

tripSchema.index({ status: 1, startDate: -1 });
tripSchema.index({ driver: 1, status: 1, createdAt: -1 });
tripSchema.index({ truck: 1, status: 1 });
tripSchema.index({ createdAt: -1 });

export const Trip: Model<TripDocument> =
  (models.Trip as Model<TripDocument> | undefined) ?? model<TripDocument>('Trip', tripSchema);
