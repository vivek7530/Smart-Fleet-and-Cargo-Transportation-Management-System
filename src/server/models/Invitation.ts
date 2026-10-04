import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  INVITATION_CHANNELS,
  INVITATION_STATUSES,
  ROLES,
  type InvitationChannel,
  type InvitationStatus,
  type Role,
} from '../types/enums';

export interface InvitationDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  mobile?: string | null;
  role: Role;
  /** Which contact channel the invitation was delivered through — becomes locked for the invitee. */
  channel: InvitationChannel;
  /** Only the SHA-256 hash of the token is persisted. */
  tokenHash: string;
  tokenPreview: string;
  invitedBy: Types.ObjectId;
  user?: Types.ObjectId | null;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
  resendCount: number;
  lastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invitationSchema = new Schema<InvitationDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: null },
    mobile: { type: String, trim: true, default: null },
    role: { type: String, enum: ROLES, required: true, index: true },
    channel: { type: String, enum: INVITATION_CHANNELS, required: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenPreview: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: INVITATION_STATUSES, default: 'PENDING', index: true },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    resendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: () => new Date() },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        // The hash must never leave the server.
        delete ret.tokenHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

invitationSchema.index({ email: 1, status: 1 });
invitationSchema.index({ mobile: 1, status: 1 });
invitationSchema.index({ createdAt: -1 });

export const Invitation: Model<InvitationDocument> =
  (models.Invitation as Model<InvitationDocument> | undefined) ?? model<InvitationDocument>('Invitation', invitationSchema);
