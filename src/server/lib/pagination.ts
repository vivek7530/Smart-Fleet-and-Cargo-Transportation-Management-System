import { Types, type FilterQuery, type Model, type PopulateOptions } from 'mongoose';
import { z } from 'zod';

/**
 * Cursor based pagination.
 *
 * The cursor encodes the value of the sort field plus the document `_id` as a
 * tiebreaker, which keeps paging stable even while rows are being inserted —
 * something offset pagination cannot guarantee.
 */

type CursorKind = 'date' | 'number' | 'string' | 'null';

interface CursorPayload {
  k: CursorKind;
  v: string | number | null;
  id: string;
}

export function encodeCursor(doc: Record<string, unknown>, sortBy: string): string {
  const raw = doc[sortBy];
  let payload: CursorPayload;

  if (raw instanceof Date) payload = { k: 'date', v: raw.toISOString(), id: String(doc._id) };
  else if (typeof raw === 'number') payload = { k: 'number', v: raw, id: String(doc._id) };
  else if (raw === null || raw === undefined) payload = { k: 'null', v: null, id: String(doc._id) };
  else payload = { k: 'string', v: String(raw), id: String(doc._id) };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
    if (!parsed || typeof parsed.id !== 'string' || !Types.ObjectId.isValid(parsed.id)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function cursorValue(payload: CursorPayload): Date | number | string | null {
  switch (payload.k) {
    case 'date':
      return new Date(payload.v as string);
    case 'number':
      return payload.v as number;
    case 'null':
      return null;
    default:
      return payload.v as string;
  }
}

function buildCursorFilter(payload: CursorPayload, sortBy: string, sortDir: 1 | -1): FilterQuery<unknown> {
  const op = sortDir === -1 ? '$lt' : '$gt';
  const id = new Types.ObjectId(payload.id);

  if (sortBy === '_id') return { _id: { [op]: id } } as FilterQuery<unknown>;

  const value = cursorValue(payload);
  // Comparisons against null are unreliable in MongoDB, so fall back to the _id tiebreaker.
  if (value === null) return { _id: { [op]: id } } as FilterQuery<unknown>;

  return {
    $or: [{ [sortBy]: { [op]: value } }, { [sortBy]: value, _id: { [op]: id } }],
  } as FilterQuery<unknown>;
}

/** Escapes user input before it is used inside a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a case-insensitive OR-search across the given fields. */
export function searchFilter(search: string | undefined, fields: string[]): FilterQuery<unknown> | null {
  const term = search?.trim();
  if (!term || fields.length === 0) return null;
  const regex = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) } as FilterQuery<unknown>;
}

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  cursor: z.string().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.string().trim().max(60).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  from: z.string().datetime().optional().or(z.string().date().optional()),
  to: z.string().datetime().optional().or(z.string().date().optional()),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * The model is intentionally loosely typed: Mongoose's `Model<T>` is invariant,
 * so a strictly generic helper cannot accept every concrete model in the app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

export interface PaginateOptions<T = unknown> {
  filter?: FilterQuery<T>;
  limit: number;
  cursor?: string | null;
  sortBy?: string;
  sortDir?: 1 | -1;
  populate?: PopulateOptions | (PopulateOptions | string)[];
  select?: string;
  /** Counting is only worth it on the first page — later pages reuse the client's copy. */
  withTotal?: boolean;
}

export interface PaginatedResult<R> {
  items: R[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export async function paginate(
  model: AnyModel,
  options: PaginateOptions,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const {
    filter = {},
    limit,
    cursor,
    sortBy = 'createdAt',
    sortDir = -1,
    populate,
    select,
    withTotal = !cursor,
  } = options;

  const decoded = cursor ? decodeCursor(cursor) : null;
  const cursorFilter = decoded ? buildCursorFilter(decoded, sortBy, sortDir) : null;

  const finalFilter = cursorFilter ? { $and: [filter, cursorFilter] } : filter;

  // Fetch one extra row to learn whether another page exists without a second query.
  let query = model
    .find(finalFilter)
    .sort(sortBy === '_id' ? { _id: sortDir } : { [sortBy]: sortDir, _id: sortDir })
    .limit(limit + 1);

  if (select) query = query.select(select);
  if (populate) query = query.populate(populate as PopulateOptions[]);

  const [docs, total] = await Promise.all([
    query.exec(),
    withTotal ? model.countDocuments(filter) : Promise.resolve(undefined),
  ]);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const items = page.map((doc) => doc.toJSON() as Record<string, unknown>);
  const last = page.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(last as unknown as Record<string, unknown>, sortBy) : null,
    ...(total !== undefined ? { total } : {}),
  };
}

/** Resolves `sortBy`/`sortDir` against an allow-list so clients cannot sort on arbitrary paths. */
export function resolveSort(
  query: { sortBy?: string; sortDir?: 'asc' | 'desc' },
  allowed: string[],
  fallback = 'createdAt',
): { sortBy: string; sortDir: 1 | -1 } {
  const sortBy = query.sortBy && allowed.includes(query.sortBy) ? query.sortBy : fallback;
  const sortDir: 1 | -1 = query.sortDir === 'asc' ? 1 : -1;
  return { sortBy, sortDir };
}

/** Turns `from`/`to` query values into a Mongo range filter for the given field. */
export function dateRangeFilter(
  field: string,
  from?: string,
  to?: string,
): FilterQuery<unknown> | null {
  if (!from && !to) return null;
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    // A bare date (YYYY-MM-DD) should include the whole day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range } as FilterQuery<unknown>;
}

/** Merges a list of optional filters into a single `$and` query. */
export function mergeFilters<T>(...filters: (FilterQuery<T> | null | undefined)[]): FilterQuery<T> {
  const present = filters.filter(Boolean) as FilterQuery<T>[];
  if (present.length === 0) return {} as FilterQuery<T>;
  if (present.length === 1) return present[0];
  return { $and: present } as FilterQuery<T>;
}
