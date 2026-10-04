import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  BREAKDOWN_SEVERITIES,
  BREAKDOWN_STATUSES,
  type BreakdownSeverity,
  type BreakdownStatus,
} from '../types/enums';

export interface BreakdownReportDocument extends Document {
  _id: Types.ObjectId;
  reportCode: string;
  truck: Types.ObjectId;
  driver: Types.ObjectId;
  trip?: Types.ObjectId | null;
  location: string;
  description: string;
  severity: BreakdownSeverity;
  status: BreakdownStatus;
  reportedAt: Date;
  acknowledgedBy?: Types.ObjectId | null;
  acknowledgedAt?: Date | null;
  resolutionNotes?: string;
  resolvedBy?: Types.ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const breakdownSchema = new Schema<BreakdownReportDocument>(
  {
    reportCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    truck: { type: Schema.Types.ObjectId, ref: 'Truck', required: true, index: true },
    driver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null, index: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: { type: String, enum: BREAKDOWN_SEVERITIES, default: 'MEDIUM', index: true },
    status: { type: String, enum: BREAKDOWN_STATUSES, default: 'REPORTED', index: true },
    reportedAt: { type: Date, required: true, default: () => new Date(), index: true },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
    resolutionNotes: { type: String, trim: true, maxlength: 2000 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

breakdownSchema.index({ createdAt: -1 });
breakdownSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const BreakdownReport: Model<BreakdownReportDocument> =
  (models.BreakdownReport as Model<BreakdownReportDocument> | undefined) ??
  model<BreakdownReportDocument>('BreakdownReport', breakdownSchema);
