import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { FUEL_TYPES, TRUCK_STATUSES, type FuelType, type TruckStatus } from '../types/enums';

/**
 * `model` is a real truck attribute, which collides with Mongoose's
 * `Document.model()` helper — the helper is omitted so the field wins.
 */
export interface TruckDocument extends Omit<Document, 'model'> {
  _id: Types.ObjectId;
  truckNumber: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacityTons: number;
  fuelType: FuelType;
  status: TruckStatus;
  assignedDriver?: Types.ObjectId | null;
  odometerKm: number;
  mileageKmPerLitre?: number;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: Date | null;
  registrationExpiry?: Date | null;
  fitnessExpiry?: Date | null;
  permitExpiry?: Date | null;
  purchaseDate?: Date | null;
  purchasePrice?: number;
  purchaseVendor?: string;
  notes?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const truckSchema = new Schema<TruckDocument>(
  {
    truckNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    registrationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1980, max: new Date().getFullYear() + 1 },
    capacityTons: { type: Number, required: true, min: 0.5, max: 200 },
    fuelType: { type: String, enum: FUEL_TYPES, default: 'DIESEL' },
    status: { type: String, enum: TRUCK_STATUSES, default: 'AVAILABLE', index: true },
    assignedDriver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    odometerKm: { type: Number, default: 0, min: 0 },
    mileageKmPerLitre: { type: Number, min: 0 },
    insuranceProvider: { type: String, trim: true },
    insurancePolicyNumber: { type: String, trim: true },
    insuranceExpiry: { type: Date, default: null, index: true },
    registrationExpiry: { type: Date, default: null },
    fitnessExpiry: { type: Date, default: null },
    permitExpiry: { type: Date, default: null },
    purchaseDate: { type: Date, default: null },
    purchasePrice: { type: Number, min: 0 },
    purchaseVendor: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

truckSchema.index({ status: 1, createdAt: -1 });
truckSchema.index({ createdAt: -1 });

export const Truck: Model<TruckDocument> =
  (models.Truck as Model<TruckDocument> | undefined) ?? model<TruckDocument>('Truck', truckSchema);
