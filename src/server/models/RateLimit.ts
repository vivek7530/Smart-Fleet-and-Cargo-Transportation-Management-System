import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * Backing collection for the MongoDB rate-limit store.
 *
 * One document per (scope, client, window). `expiresAt` carries a TTL index so
 * MongoDB reclaims finished windows without any sweeper of our own.
 */
export interface RateLimitDocument extends Omit<Document, '_id'> {
  /** `${scope}:${client}:${windowStart}` */
  _id: string;
  count: number;
  resetAt: Date;
  expiresAt: Date;
}

const rateLimitSchema = new Schema<RateLimitDocument>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
    // TTL: MongoDB removes the document once this timestamp passes.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

export const RateLimit: Model<RateLimitDocument> =
  (models.RateLimit as Model<RateLimitDocument> | undefined) ??
  model<RateLimitDocument>('RateLimit', rateLimitSchema);
