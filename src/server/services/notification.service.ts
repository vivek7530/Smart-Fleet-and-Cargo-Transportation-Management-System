// `Types` is used at runtime by `toId`, so it must be a value import.
import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { logger } from '../lib/logger';
import type { NotificationType, Role } from '../types/enums';

/** A recipient may be an id, or an already-populated user document. */
export type UserRef = Types.ObjectId | string | { _id: Types.ObjectId | string } | null | undefined;

export interface NotifyInput {
  users: UserRef[];
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity?: string;
  entityId?: Types.ObjectId | string | null;
}

/**
 * Normalises a reference to its id string.
 * Calling `String()` on a populated document yields its inspected form rather
 * than an id, so populated refs are unwrapped explicitly.
 */
export function toId(ref: UserRef): string | null {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  if (ref instanceof Types.ObjectId) return ref.toString();
  if (typeof ref === 'object' && '_id' in ref && ref._id) return String(ref._id);
  return null;
}

/** Creates one notification per recipient. Never throws into the request path. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipients = [...new Set(input.users.map(toId).filter((id): id is string => Boolean(id)))];
    if (recipients.length === 0) return;

    await Notification.insertMany(
      recipients.map((user) => ({
        user,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        entity: input.entity,
        entityId: input.entityId ?? null,
      })),
    );
  } catch (error) {
    logger.warn('Failed to create notifications', error);
  }
}

/** Resolves every active user holding one of the given roles — used to alert the back office. */
export async function usersWithRoles(...roles: Role[]): Promise<Types.ObjectId[]> {
  const users = await User.find({ role: { $in: roles }, status: 'ACTIVE' }).select('_id').lean();
  return users.map((user) => user._id);
}

