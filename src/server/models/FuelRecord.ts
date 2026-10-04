import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';

export interface FuelRecordDocument extends Document {
  _id: Types.ObjectId;
  truck: Types.ObjectId;
  driver?: Types.ObjectId | null;
  trip?: Types.ObjectId | null;
  date: Date;
  litres: number;
  pricePerLitre: number;
  totalCost: number;
  odometerKm?: number;
  station?: string;
  location?: string;
  paymentMode: 'CASH' | 'CARD' | 'FUEL_CARD' | 'CREDIT' | 'UPI';
  notes?: string;
  /** Reference printed on the fuel bill — no file is ever stored. */
  billNumber?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const fuelRecordSchema = new Schema<FuelRecordDocument>(
  {
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', required: true, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    date: { type: Date, required: true, index: true },
    litres: { type: Number, required: true, min: 0 },
    pricePerLitre: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    odometerKm: { type: Number, min: 0 },
    station: { type: String, trim: true },
    location: { type: String, trim: true },
    paymentMode: {
      type: String,
      enum: ['CASH', 'CARD', 'FUEL_CARD', 'CREDIT', 'UPI'],
      default: 'FUEL_CARD',
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    billNumber: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

// Keep totalCost consistent even when a client sends a stale value.
fuelRecordSchema.pre('validate', function (next) {
  if (this.litres != null && this.pricePerLitre != null) {
    this.totalCost = Math.round(this.litres * this.pricePerLitre * 100) / 100;
  }
  next();
});

fuelRecordSchema.index({ date: -1 });
fuelRecordSchema.index({ createdAt: -1 });
fuelRecordSchema.index({ truck: 1, date: -1 });

export const FuelRecord: Model<FuelRecordDocument> =
  (models.FuelRecord as Model<FuelRecordDocument> | undefined) ?? model<FuelRecordDocument>('FuelRecord', fuelRecordSchema);
