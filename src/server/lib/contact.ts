import { z } from 'zod';

/**
 * Mobile numbers are normalised to E.164-ish form: an optional leading `+`
 * followed by 8–15 digits. Spaces, dashes and brackets are stripped.
 */
export function normaliseMobile(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function isValidMobile(input: string): boolean {
  const normalised = normaliseMobile(input);
  return /^\+?[0-9]{8,15}$/.test(normalised);
}

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .transform(normaliseEmail);

export const mobileField = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .transform(normaliseMobile)
  .refine(isValidMobile, 'Please enter a valid mobile number (8–15 digits)');

/** Treats empty strings from HTML forms as "not provided". */
export const optionalEmailField = z
  .union([z.literal(''), emailField])
  .optional()
  .transform((value) => (value ? value : undefined));

export const optionalMobileField = z
  .union([z.literal(''), mobileField])
  .optional()
  .transform((value) => (value ? value : undefined));

export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');
