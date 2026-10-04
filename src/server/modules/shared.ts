import { z } from 'zod';

/** Reusable primitives shared by every module's validation schemas. */
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid');

export const dateString = z.string().datetime().or(z.string().date());

export const optionalDateString = dateString.nullable().optional();

export const idParamSchema = z.object({ id: objectId });

/** Empty-string-tolerant number, for optional numeric form fields. */
export const optionalNumber = z.union([z.literal(''), z.coerce.number()]).optional();

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
