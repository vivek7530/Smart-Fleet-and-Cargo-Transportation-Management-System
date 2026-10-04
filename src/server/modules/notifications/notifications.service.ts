import { z } from 'zod';
import { Notification } from '../../models/Notification';
import { AuditLog } from '../../models/AuditLog';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  listQuerySchema,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
} from '../../lib/pagination';
import { objectId } from '../shared';
import type { Ctx } from '../../api/context';

export const listNotificationsQuerySchema = listQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

export async function listNotifications(query: z.infer<typeof listNotificationsQuerySchema>, ctx: Ctx) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt']);

  // Notifications are strictly per-user; there is no cross-user access path.
  const filter = mergeFilters({ user: ctx.user._id }, query.unreadOnly ? { read: false } : null);

  const [page, unreadCount] = await Promise.all([
    paginate(Notification, { filter, limit: query.limit, cursor: query.cursor, sortBy, sortDir }),
    Notification.countDocuments({ user: ctx.user._id, read: false }),
  ]);

  return { ...page, unreadCount };
}

export async function unreadCount(ctx: Ctx) {
  return { count: await Notification.countDocuments({ user: ctx.user._id, read: false }) };
}

export async function markNotificationRead(id: string, ctx: Ctx) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user: ctx.user._id },
    { read: true, readAt: new Date() },
    { new: true },
  );
  if (!notification) throw ApiError.notFound('That notification could not be found');
  return notification;
}

export async function markAllNotificationsRead(ctx: Ctx) {
  const result = await Notification.updateMany(
    { user: ctx.user._id, read: false },
    { read: true, readAt: new Date() },
  );
  return { updated: result.modifiedCount };
}

export async function deleteNotification(id: string, ctx: Ctx) {
  const result = await Notification.deleteOne({ _id: id, user: ctx.user._id });
  if (result.deletedCount === 0) throw ApiError.notFound('That notification could not be found');
  return { id };
}

/* ------------------------------------------------------------------ audit log */

export const listAuditQuerySchema = listQuerySchema.extend({
  user: objectId.optional(),
  entity: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
});

export async function listAuditLogs(query: z.infer<typeof listAuditQuerySchema>) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt']);

  const filter = mergeFilters(
    query.user ? { user: query.user } : null,
    query.entity ? { entity: query.entity } : null,
    query.action ? { action: query.action } : null,
    searchFilter(query.search, ['summary', 'userName', 'action', 'entity']),
    dateRangeFilter('createdAt', query.from, query.to),
  );

  return paginate(AuditLog, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'user', select: 'name role avatarColor' },
  });
}

/** Distinct values used to populate the audit filter dropdowns. */
export async function auditFacets() {
  const [entities, actions] = await Promise.all([AuditLog.distinct('entity'), AuditLog.distinct('action')]);
  return { entities: entities.sort(), actions: actions.sort() };
}
