import { z } from 'zod';
import { isValidPhone, normalisePhone, optionalPhoneField, phoneField } from '../../lib/phone';

export { PHONE_LENGTH, PHONE_MESSAGE, formatPhone } from '../../lib/phone';

/**
 * Mobile numbers follow one rule product-wide, defined in `src/lib/phone.ts`
 * so the browser and the API can never disagree: exactly ten digits, stored
 * bare, with `+91`, `0091` and a leading `0` all stripped on the way in.
 *
 * The `…Mobile` names are kept as the server's vocabulary for the same rule.
 */
export const normaliseMobile = normalisePhone;
export const isValidMobile = isValidPhone;

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .transform(normaliseEmail);

export const mobileField = phoneField;

/** Treats empty strings from HTML forms as "not provided". */
export const optionalEmailField = z
  .union([z.literal(''), emailField])
  .optional()
  .transform((value) => (value ? value : undefined));

export const optionalMobileField = optionalPhoneField;

export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');
