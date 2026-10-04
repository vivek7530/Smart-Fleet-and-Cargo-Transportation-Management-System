import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { TRANSPORTATION_COST_TYPES, type TransportationCostType } from '../types/enums';

export interface TransportationCostDocument extends Document {
  _id: Types.ObjectId;
  trip: Types.ObjectId;
  truck?: Types.ObjectId | null;
  type: TransportationCostType;
  amount: number;
  date: Date;
  description?: string;
  vendor?: string;
  document?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const transportationCostSchema = new Schema<TransportationCostDocument>(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', default: null, index: true },
    type: { type: String, enum: TRANSPORTATION_COST_TYPES, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    vendor: { type: String, trim: true },
    document: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

transportationCostSchema.index({ createdAt: -1 });
transportationCostSchema.index({ trip: 1, date: -1 });

export const TransportationCost: Model<TransportationCostDocument> =
  (models.TransportationCost as Model<TransportationCostDocument> | undefined) ??
  model<TransportationCostDocument>('TransportationCost', transportationCostSchema);
