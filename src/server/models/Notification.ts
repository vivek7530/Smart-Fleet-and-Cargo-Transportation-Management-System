import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '../types/enums';

export interface NotificationDocument extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity?: string;
  entityId?: Types.ObjectId | null;
  read: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'GENERAL', index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    entity: { type: String, trim: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret: Record<string, unknown>) => (delete ret.__v, ret) },
    toObject: { virtuals: true },
  },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

export const Notification: Model<NotificationDocument> =
  (models.Notification as Model<NotificationDocument> | undefined) ??
  model<NotificationDocument>('Notification', notificationSchema);
