import { Schema, type Types } from 'mongoose';
import { SHARE_PERMISSIONS, type SharePermission } from '../types/enums';

/**
 * One manager an administrator granted access to a truck (and, by inheritance,
 * to that truck's trips). Managers never create these — sharing is an
 * administrator's decision, so `sharedBy` is always an admin.
 */
export interface ShareEntry {
  user: Types.ObjectId;
  permission: SharePermission;
  sharedBy: Types.ObjectId;
  sharedAt: Date;
}

export const shareSchema = new Schema<ShareEntry>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    permission: { type: String, enum: SHARE_PERMISSIONS, default: 'VIEW' },
    sharedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sharedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** One stretch of time a truck spent under a particular manager. */
export interface OwnerHistoryEntry {
  owner: Types.ObjectId | null;
  from: Date;
  to?: Date | null;
}

export const ownerHistorySchema = new Schema<OwnerHistoryEntry>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    from: { type: Date, required: true },
    to: { type: Date, default: null },
  },
  { _id: false },
);
