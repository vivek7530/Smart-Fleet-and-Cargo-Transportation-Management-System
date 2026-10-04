import { connectToDatabase } from '../../db';
import { RateLimit } from '../../models/RateLimit';
import { logger } from '../../lib/logger';
import { memoryStore } from './memory-store';
import { windowKey, windowStart, type RateLimitHit, type RateLimitStore } from './store';

/**
 * Shared store backed by the MongoDB the app already depends on, so multiple
 * replicas count against the same window with no extra infrastructure.
 *
 * `$inc` inside `findOneAndUpdate` is atomic, so concurrent replicas cannot lose
 * counts, and a TTL index on `expiresAt` clears finished windows. Because only
 * failed attempts are recorded, the write volume is negligible.
 */
export const mongoStore: RateLimitStore = {
  name: 'mongo',

  async count(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const resetAt = new Date(windowStart(windowMs, now) + windowMs);

    try {
      await connectToDatabase();
      const document = await RateLimit.findById(windowKey(key, windowMs, now))
        .select('count resetAt')
        .lean();
      return { count: document?.count ?? 0, resetAt: document?.resetAt ?? resetAt };
    } catch (error) {
      logger.warn('Rate-limit store unavailable, reading the in-process window instead', error);
      return memoryStore.count(key, windowMs);
    }
  },

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const start = windowStart(windowMs, now);
    const resetAt = new Date(start + windowMs);

    try {
      await connectToDatabase();

      const document = await RateLimit.findByIdAndUpdate(
        windowKey(key, windowMs, now),
        {
          $inc: { count: 1 },
          // Only set on insert, so a concurrent replica cannot move the boundary.
          $setOnInsert: { resetAt, expiresAt: new Date(start + windowMs * 2) },
        },
        { new: true, upsert: true, projection: { count: 1, resetAt: 1 } },
      ).lean();

      return { count: document?.count ?? 1, resetAt: document?.resetAt ?? resetAt };
    } catch (error) {
      // The limiter must never be the reason a request fails. Falling back to the
      // local window still slows guessing, just per replica.
      logger.warn('Rate-limit store unavailable, falling back to in-process counting', error);
      return memoryStore.hit(key, windowMs);
    }
  },
};
