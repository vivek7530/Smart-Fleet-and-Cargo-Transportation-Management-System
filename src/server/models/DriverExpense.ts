import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  DRIVER_EXPENSE_TYPES,
  EXPENSE_STATUSES,
  type DriverExpenseType,
  type ExpenseStatus,
} from '../types/enums';

export interface DriverExpenseDocument extends Document {
  _id: Types.ObjectId;
  driver: Types.ObjectId;
  trip?: Types.ObjectId | null;
  truck?: Types.ObjectId | null;
  type: DriverExpenseType;
  amount: number;
  date: Date;
  description?: string;
  /** Reference printed on the paper receipt — no file is ever stored. */
  receiptNumber?: string;
  status: ExpenseStatus;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const driverExpenseSchema = new Schema<DriverExpenseDocument>(
  {
    driver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', default: null },
    type: { type: String, enum: DRIVER_EXPENSE_TYPES, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    receiptNumber: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: EXPENSE_STATUSES, default: 'PENDING', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

driverExpenseSchema.index({ status: 1, createdAt: -1 });
driverExpenseSchema.index({ driver: 1, status: 1, date: -1 });
driverExpenseSchema.index({ createdAt: -1 });

export const DriverExpense: Model<DriverExpenseDocument> =
  (models.DriverExpense as Model<DriverExpenseDocument> | undefined) ??
  model<DriverExpenseDocument>('DriverExpense', driverExpenseSchema);
