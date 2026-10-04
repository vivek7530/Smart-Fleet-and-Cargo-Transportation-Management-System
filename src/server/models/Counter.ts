import { Schema, model, models, type Document, type Model } from 'mongoose';

/** `_id` is a string key here, so the default ObjectId `_id` is omitted. */
export interface CounterDocument extends Omit<Document, '_id'> {
  _id: string;
  seq: number;
}

/** Backing store for human friendly sequential codes (TRP0001, CRG0042, …). */
const counterSchema = new Schema<CounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter: Model<CounterDocument> =
  (models.Counter as Model<CounterDocument> | undefined) ?? model<CounterDocument>('Counter', counterSchema);

export async function nextSequence(key: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return doc?.seq ?? 1;
}

/** e.g. formatCode('TRP', 42) → "TRP0042" */
export function formatCode(prefix: string, seq: number, width = 4): string {
  return `${prefix}${String(seq).padStart(width, '0')}`;
}

export async function nextCode(prefix: string, key = prefix, width = 4): Promise<string> {
  return formatCode(prefix, await nextSequence(key), width);
}
