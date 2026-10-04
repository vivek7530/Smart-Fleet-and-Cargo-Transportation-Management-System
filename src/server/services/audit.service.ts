import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../lib/logger';
import type { AnonCtx } from '../api/context';

export interface AuditInput {
  /** Caller context — supplies the actor plus their IP and user agent. */
  ctx?: AnonCtx;
  action: string;
  /** A readable sentence, e.g. "Admin invited John as Driver". */
  summary: string;
  entity: string;
  entityId?: Types.ObjectId | string | null;
  metadata?: Record<string, unknown>;
  /** Overrides the actor when there is no signed-in user (seed scripts, jobs). */
  actor?: { id?: Types.ObjectId | string | null; name: string; role?: string };
}

/**
 * Writes an audit entry. Deliberately fire-and-forget: a logging failure must
 * never turn a successful business operation into an error for the user.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const user = input.ctx?.user;
    const actorId = input.actor?.id ?? user?._id ?? null;

    await AuditLog.create({
      user: actorId,
      userName: input.actor?.name ?? user?.name ?? 'System',
      userRole: input.actor?.role ?? user?.role,
      action: input.action,
      summary: input.summary,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
      ip: input.ctx?.ip,
      userAgent: input.ctx?.userAgent,
    });
  } catch (error) {
    logger.warn('Failed to write audit log', error);
  }
}
