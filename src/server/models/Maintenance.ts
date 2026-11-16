import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  type MaintenanceStatus,
  type MaintenanceType,
} from '../types/enums';

export interface MaintenanceDocument extends Document {
  _id: Types.ObjectId;
  truck: Types.ObjectId;
  type: MaintenanceType;
  description: string;
  cost: number;
  estimatedPartsCost: number;
  estimatedLabourCost: number;
  estimatedOtherCost: number;
  estimatedTax: number;
  estimatedCost: number;
  actualPartsCost: number;
  actualLabourCost: number;
  actualOtherCost: number;
  actualTax: number;
  approvedBy?: Types.ObjectId | null;
  date: Date;
  serviceProvider?: string;
  nextServiceDate?: Date | null;
  odometerKm?: number;
  status: MaintenanceStatus;
  documents: Types.ObjectId[];
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const maintenanceSchema = new Schema<MaintenanceDocument>(
  {
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', required: true, index: true },
    type: { type: String, enum: MAINTENANCE_TYPES, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    cost: { type: Number, required: true, min: 0 },
    estimatedPartsCost: { type: Number, default: 0, min: 0 },
    estimatedLabourCost: { type: Number, default: 0, min: 0 },
    estimatedOtherCost: { type: Number, default: 0, min: 0 },
    estimatedTax: { type: Number, default: 0, min: 0 },
    estimatedCost: { type: Number, default: 0, min: 0 },
    actualPartsCost: { type: Number, default: 0, min: 0 },
    actualLabourCost: { type: Number, default: 0, min: 0 },
    actualOtherCost: { type: Number, default: 0, min: 0 },
    actualTax: { type: Number, default: 0, min: 0 },
    date: { type: Date, required: true, index: true },
    serviceProvider: { type: String, trim: true },
    nextServiceDate: { type: Date, default: null, index: true },
    odometerKm: { type: Number, min: 0 },
    status: { type: String, enum: MAINTENANCE_STATUSES, default: 'COMPLETED', index: true },
    documents: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

maintenanceSchema.index({ createdAt: -1 });
maintenanceSchema.index({ truck: 1, date: -1 });
maintenanceSchema.index({ truck: 1, status: 1, date: 1 });

export const Maintenance: Model<MaintenanceDocument> =
  (models.Maintenance as Model<MaintenanceDocument> | undefined) ?? model<MaintenanceDocument>('Maintenance', maintenanceSchema);
