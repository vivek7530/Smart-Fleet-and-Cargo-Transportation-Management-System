import type { NextRequest } from 'next/server';
import { TokenExpiredError } from 'jsonwebtoken';
import { connectToDatabase } from '../db';
import { ApiError } from '../lib/ApiError';
import { verifyAuthToken } from '../lib/jwt';
import { env } from '../config/env';
import { User, type UserDocument } from '../models/User';
import type { Role } from '../types/enums';

/**
 * Everything a service needs to know about the caller.
 * This replaces the Express `req` object that used to be threaded around.
 */
export interface Ctx {
  user: UserDocument;
  ip?: string;
  userAgent?: string;
}

/** Audit metadata for actions performed without a signed-in user. */
export interface AnonCtx {
  user?: UserDocument;
  ip?: string;
  userAgent?: string;
}

export function requestMeta(request: NextRequest): AnonCtx {
  return {
    ip:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
}

function extractToken(request: NextRequest): string | null {
  const cookie = request.cookies.get(env.cookieName)?.value;
  if (cookie) return cookie;

  // Bearer tokens are accepted as a fallback for API clients and tooling.
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

/**
 * Resolves the caller from the signed cookie and re-reads the user from
 * MongoDB on every request, so a role change or suspension takes effect
 * immediately and role claims can never be spoofed by the client.
 */
export async function requireAuth(request: NextRequest): Promise<Ctx> {
  await connectToDatabase();

  const token = extractToken(request);
  if (!token) throw ApiError.unauthenticated('You must be signed in to continue');

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw ApiError.unauthenticated('Your session has expired, please sign in again', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthenticated('Your session is no longer valid, please sign in again');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthenticated('Your account could not be found');
  if (user.status === 'SUSPENDED') throw ApiError.forbidden('Your account has been suspended');
  if (user.status === 'INVITED') throw ApiError.forbidden('Your account has not been activated yet');

  return { user, ...requestMeta(request) };
}

/** Authorisation is always derived from the persisted user, never the request body. */
export async function requireRoles(request: NextRequest, ...roles: Role[]): Promise<Ctx> {
  const ctx = await requireAuth(request);
  if (!roles.includes(ctx.user.role)) {
    throw ApiError.forbidden('Your role does not allow this action');
  }
  return ctx;
}

export const requireAdmin = (request: NextRequest) => requireRoles(request, 'ADMIN');
export const requireStaff = (request: NextRequest) => requireRoles(request, 'ADMIN', 'MANAGER');

/** For public endpoints that still need the database. */
export async function publicContext(request: NextRequest): Promise<AnonCtx> {
  await connectToDatabase();
  return requestMeta(request);
}
