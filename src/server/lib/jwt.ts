import jwt, { type SignOptions } from 'jsonwebtoken';
import type { NextResponse } from 'next/server';
import { env } from '../config/env';
import type { Role } from '../types/enums';

export interface JwtPayload {
  sub: string;
  role: Role;
}

export function signAuthToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    issuer: 'cargoentry',
  } as SignOptions);
}

export function verifyAuthToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret, { issuer: 'cargoentry' }) as JwtPayload;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

/**
 * The token lives only in an HTTP-only cookie, so browser JavaScript — and
 * therefore any XSS payload — can never read it.
 */
export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: env.cookieName,
    value: token,
    secure: env.cookieSecure,
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set({
    ...COOKIE_OPTIONS,
    name: env.cookieName,
    value: '',
    secure: env.cookieSecure,
    maxAge: 0,
  });
}
