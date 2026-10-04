import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { CARGO_STATUSES, CARGO_TYPES, type CargoStatus, type CargoType } from '../types/enums';

export interface CargoDocument extends Document {
  _id: Types.ObjectId;
  cargoCode: string;
  description: string;
  type: CargoType;
  weightTons: number;
  units?: number;
  declaredValue?: number;
  shipperName: string;
  shipperContact?: string;
  consigneeName: string;
  consigneeContact?: string;
  origin: string;
  destination: string;
  status: CargoStatus;
  trip?: Types.ObjectId | null;
  handlingInstructions?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const cargoSchema = new Schema<CargoDocument>(
  {
    cargoCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: CARGO_TYPES, default: 'GENERAL', index: true },
    weightTons: { type: Number, required: true, min: 0 },
    units: { type: Number, min: 0 },
    declaredValue: { type: Number, min: 0 },
    shipperName: { type: String, required: true, trim: true },
    shipperContact: { type: String, trim: true },
    consigneeName: { type: String, required: true, trim: true },
    consigneeContact: { type: String, trim: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    status: { type: String, enum: CARGO_STATUSES, default: 'PENDING', index: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    handlingInstructions: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

cargoSchema.index({ status: 1, createdAt: -1 });
cargoSchema.index({ createdAt: -1 });

export const Cargo: Model<CargoDocument> =
  (models.Cargo as Model<CargoDocument> | undefined) ?? model<CargoDocument>('Cargo', cargoSchema);
