import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';

export interface AuditLogDocument extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId | null;
  /** Denormalised so the log stays readable even if the user is later removed. */
  userName: string;
  userRole?: string;
  action: string;
  /** Human readable sentence, e.g. "Admin invited John as Driver". */
  summary: string;
  entity: string;
  entityId?: Types.ObjectId | null;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, required: true },
    userRole: { type: String },
    action: { type: String, required: true, index: true },
    summary: { type: String, required: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

export const AuditLog: Model<AuditLogDocument> =
  (models.AuditLog as Model<AuditLogDocument> | undefined) ?? model<AuditLogDocument>('AuditLog', auditLogSchema);
