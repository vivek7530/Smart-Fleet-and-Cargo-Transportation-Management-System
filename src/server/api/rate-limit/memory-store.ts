import { windowKey, windowStart, type RateLimitHit, type RateLimitStore } from './store';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process store — the default, and correct for a single instance.
 * State is held on `globalThis` so it survives Next.js hot reloads in dev.
 */
declare global {
  // eslint-disable-next-line no-var
  var __cargoentryRateLimit: Map<string, Bucket> | undefined;
}

const buckets = globalThis.__cargoentryRateLimit ?? new Map<string, Bucket>();
globalThis.__cargoentryRateLimit = buckets;

export const memoryStore: RateLimitStore = {
  name: 'memory',

  async count(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const bucket = buckets.get(windowKey(key, windowMs, now));
    const resetAt = new Date(windowStart(windowMs, now) + windowMs);

    if (!bucket || bucket.resetAt <= now) return { count: 0, resetAt };
    return { count: bucket.count, resetAt: new Date(bucket.resetAt) };
  },

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const bucketKey = windowKey(key, windowMs, now);

    const existing = buckets.get(bucketKey);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return { count: existing.count, resetAt: new Date(existing.resetAt) };
    }

    const resetAt = windowStart(windowMs, now) + windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    sweep(now);
    return { count: 1, resetAt: new Date(resetAt) };
  },
};

/** Drops finished windows so the map cannot grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
