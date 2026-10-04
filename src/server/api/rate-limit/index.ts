import type { NextRequest } from 'next/server';
import { ApiError } from '../../lib/ApiError';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { memoryStore } from './memory-store';
import { mongoStore } from './mongo-store';
import type { RateLimitStore } from './store';

export type { RateLimitStore, RateLimitHit } from './store';

/**
 * Brute-force protection for credential and token endpoints.
 *
 * The rule that keeps this out of ordinary users' way: **only failed attempts
 * are counted.** Signing in correctly, inviting a colleague or changing your own
 * password never consumes budget, so a legitimate user cannot be locked out no
 * matter how much they use the app. The window only ever slows down guessing.
 *
 * Driver is chosen with `RATE_LIMIT_DRIVER`:
 *   memory (default) — single instance
 *   mongo            — shared across replicas, uses the existing database
 */
function selectStore(): RateLimitStore {
  if (env.rateLimit.driver === 'mongo') return mongoStore;
  return memoryStore;
}

const store = selectStore();

if (env.rateLimit.driver === 'mongo') {
  logger.info('Rate limiting uses the shared MongoDB window (safe across replicas)');
}

export function rateLimitStoreName(): RateLimitStore['name'] {
  return store.name;
}

/** Identifies the caller for limiting purposes. */
function clientKey(request: NextRequest, scope: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  return `${scope}:${ip}`;
}

/**
 * Rejects the request only when this client has already accumulated too many
 * *failures* in the current window. Call this before doing the work.
 */
export async function assertWithinRateLimit(request: NextRequest, scope = 'auth'): Promise<void> {
  const { count, resetAt } = await store.count(clientKey(request, scope), env.rateLimit.windowMs);
  if (count < env.rateLimit.maxFailures) return;

  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60_000));
  throw new ApiError(
    429,
    'RATE_LIMITED',
    `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  );
}

/**
 * Records one failed attempt. Deliberately never throws — a limiter problem must
 * not turn a handled failure into a 500.
 */
export async function recordRateLimitFailure(request: NextRequest, scope = 'auth'): Promise<void> {
  try {
    await store.hit(clientKey(request, scope), env.rateLimit.windowMs);
  } catch (error) {
    logger.warn('Could not record a failed attempt against the rate limit', error);
  }
}

/**
 * Wraps a handler so failures count towards the window and successes do not.
 * `shouldCount` keeps validation slips (a mistyped email) from consuming budget —
 * only genuine credential and token rejections do.
 */
export async function withFailureLimit<T>(
  request: NextRequest,
  run: () => Promise<T>,
  options: { scope?: string; shouldCount?: (error: unknown) => boolean } = {},
): Promise<T> {
  const scope = options.scope ?? 'auth';
  const shouldCount = options.shouldCount ?? isCredentialFailure;

  await assertWithinRateLimit(request, scope);

  try {
    return await run();
  } catch (error) {
    if (shouldCount(error)) await recordRateLimitFailure(request, scope);
    throw error;
  }
}

/** A wrong password, an unknown account, or a bad/expired token. */
export function isCredentialFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === 'INVALID_CREDENTIALS' ||
    error.code === 'UNAUTHENTICATED' ||
    error.code === 'TOKEN_EXPIRED' ||
    (error.status === 404 && error.code === 'NOT_FOUND')
  );
}
