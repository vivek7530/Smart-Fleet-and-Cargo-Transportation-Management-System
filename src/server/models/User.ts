import { Schema, model, models, type Document, type Model, type Types } from 'mongoose';
import {
  INVITATION_STATUSES,
  ROLES,
  USER_STATUSES,
  type InvitationStatus,
  type Role,
  type UserStatus,
} from '../types/enums';

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  mobile?: string | null;
  passwordHash?: string;
  role: Role;
  status: UserStatus;
  /** The contact channel used for the invitation — it can never be edited by the user. */
  lockedContactField?: 'email' | 'mobile' | null;
  invitedBy?: Types.ObjectId | null;
  /**
   * DRIVER only: the manager this driver works under. `null` means nobody has
   * been given charge of them yet — they show as a red flag to administrators
   * and are invisible to every manager. Always `null` for ADMIN and MANAGER.
   */
  manager?: Types.ObjectId | null;
  invitationStatus: InvitationStatus;
  avatarColor?: string;
  designation?: string;
  address?: string;
  dateOfBirth?: Date | null;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  /** DRIVER-specific profile fields. */
  licenseNumber?: string;
  licenseExpiry?: Date | null;
  experienceYears?: number;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // A driver's identity is the contact they were invited on — email or mobile,
    // both unique below. Names are free to repeat: two managers may each employ a
    // "Ramesh Yadav", and blocking that would be a constraint on reality, not data.
    // `sparse` keeps the unique constraint while allowing users who only have a mobile.
    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
      default: undefined,
    },
    mobile: { type: String, trim: true, unique: true, sparse: true, default: undefined },
    // Never returned unless explicitly selected.
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: USER_STATUSES, default: 'INVITED', index: true },
    lockedContactField: { type: String, enum: ['email', 'mobile', null], default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    invitationStatus: { type: String, enum: INVITATION_STATUSES, default: 'NONE' },
    avatarColor: { type: String, default: 'violet' },
    designation: { type: String, trim: true },
    address: { type: String, trim: true },
    dateOfBirth: { type: Date, default: null },
    emergencyContactName: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    licenseExpiry: { type: Date, default: null },
    experienceYears: { type: Number, min: 0, max: 60 },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

userSchema.index({ role: 1, status: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', email: 'text', mobile: 'text' });
// Manager-scoped driver lists, and the unassigned-driver red flag.
userSchema.index({ role: 1, manager: 1, status: 1 });

userSchema.pre('validate', function () {
  // `manager` means "the manager this driver works under", so it is meaningless
  // on an admin or a manager. Clearing it stops the field quietly drifting into
  // a second, unintended meaning.
  if (this.role !== 'DRIVER') this.manager = null;
});

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument> | undefined) ?? model<UserDocument>('User', userSchema);
