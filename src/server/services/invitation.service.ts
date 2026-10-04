import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { Invitation, type InvitationDocument } from '../models/Invitation';
import { ApiError } from '../lib/ApiError';
import { logger } from '../lib/logger';
import type { InvitationChannel } from '../types/enums';

/**
 * Invitation tokens are 32 random bytes. Only the SHA-256 hash is stored, so a
 * database dump cannot be replayed to hijack a pending invitation.
 */
export function generateInvitationToken(): { token: string; tokenHash: string; preview: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    preview: `${token.slice(0, 6)}⬦${token.slice(-4)}`,
  };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function invitationExpiry(): Date {
  return new Date(Date.now() + env.invitationExpiresHours * 60 * 60 * 1000);
}

export function buildInvitationLink(token: string): string {
  return `${env.appUrl.replace(/\/$/, '')}/register?token=${encodeURIComponent(token)}`;
}

/**
 * Resolves a raw token to a usable invitation, or throws a precise error.
 * Expired invitations are marked as such on the way out.
 */
export async function resolveInvitation(token: string): Promise<InvitationDocument> {
  const invitation = await Invitation.findOne({ tokenHash: hashToken(token) });

  if (!invitation) {
    throw ApiError.notFound('This invitation link is not valid. Please ask your administrator for a new one.');
  }
  if (invitation.status === 'ACCEPTED') {
    throw ApiError.conflict('This invitation has already been used. Please sign in instead.');
  }
  if (invitation.status === 'REVOKED') {
    throw ApiError.conflict('This invitation was revoked by an administrator.');
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    if (invitation.status !== 'EXPIRED') {
      invitation.status = 'EXPIRED';
      await invitation.save();
    }
    throw ApiError.conflict('This invitation has expired. Please ask your administrator for a new one.');
  }

  return invitation;
}

/**
 * Delivery of the invitation.
 *
 * No email/SMS provider is wired up in this build, so the link is written to the
 * server log and also returned to the inviting administrator, who can share it
 * directly. Swap the body of this function for your provider of choice.
 */
export async function deliverInvitation(params: {
  channel: InvitationChannel;
  to: string;
  name: string;
  role: string;
  link: string;
}): Promise<{ delivered: boolean; channel: InvitationChannel; to: string }> {
  const target = params.channel === 'EMAIL' ? `email ${params.to}` : `mobile ${params.to}`;
  logger.info(
    `Invitation for ${params.name} (${params.role}) → ${target}\n           ${params.link}`,
  );
  return { delivered: true, channel: params.channel, to: params.to };
}

export function invitationSummary(invitation: InvitationDocument): {
  name: string;
  role: string;
  email: string | null;
  mobile: string | null;
  channel: InvitationChannel;
  /** The field the invitee is NOT allowed to change. */
  lockedField: 'email' | 'mobile';
  expiresAt: Date;
} {
  return {
    name: invitation.name,
    role: invitation.role,
    email: invitation.email ?? null,
    mobile: invitation.mobile ?? null,
    channel: invitation.channel,
    lockedField: invitation.channel === 'EMAIL' ? 'email' : 'mobile',
    expiresAt: invitation.expiresAt,
  };
}

export type InvitationRef = Types.ObjectId;

