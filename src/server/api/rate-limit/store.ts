/**
 * Fixed-window rate limiting, behind a store interface.
 *
 * Only *failed* attempts are ever counted (see `./index.ts`), so ordinary use —
 * signing in successfully, inviting colleagues, changing your own password —
 * never consumes budget and can never lock someone out. The window exists to
 * slow down password and token guessing, nothing else.
 *
 * A single instance is served by the in-memory driver. Multiple replicas need a
 * shared window, which the MongoDB driver provides using the database the app
 * already depends on — no extra infrastructure.
 */

export interface RateLimitHit {
  /** Failed attempts recorded in the current window. */
  count: number;
  /** When the current window ends. */
  resetAt: Date;
}

export interface RateLimitStore {
  readonly name: 'memory' | 'mongo';
  /** Reads the current tally without recording anything. */
  count(key: string, windowMs: number): Promise<RateLimitHit>;
  /** Atomically records one failed attempt and reports the running total. */
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

/**
 * Windows are aligned to fixed boundaries so every replica agrees on which
 * window an attempt belongs to without needing a shared clock authority.
 */
export function windowStart(windowMs: number, now = Date.now()): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function windowKey(key: string, windowMs: number, now = Date.now()): string {
  return `${key}:${windowStart(windowMs, now)}`;
}
