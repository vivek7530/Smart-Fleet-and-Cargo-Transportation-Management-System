import { z } from 'zod';

/**
 * One definition of a mobile number for the whole product.
 *
 * Every number in this system is an Indian subscriber number: exactly ten
 * digits, stored bare. Country codes, the old `0` trunk prefix, spaces,
 * dashes and brackets are all accepted on the way in and stripped, so a
 * number typed as `+91 98334 40021`, `098334-40021` or `9833440021` is
 * always the same record. Both the browser and the API validate against
 * these helpers, so the rule can never drift between the two.
 */

export const PHONE_LENGTH = 10;

/** Shown in the field, not stored — a sample number of the right shape. */
export const PHONE_PLACEHOLDER = '9876543210';

/** The single message every form shows for a badly formed number. */
export const PHONE_MESSAGE = `Enter a ${PHONE_LENGTH}-digit mobile number`;

const PHONE_PATTERN = new RegExp(`^[0-9]{${PHONE_LENGTH}}$`);

/** Reduces any way of writing a number to the bare subscriber digits. */
export function normalisePhone(input: string | null | undefined): string {
  const digits = String(input ?? '').replace(/\D/g, '');

  // `+91…` / `91…`, `0091…` and the domestic `0…` trunk prefix all describe
  // the same subscriber number.
  if (digits.length === PHONE_LENGTH + 2 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === PHONE_LENGTH + 4 && digits.startsWith('0091')) return digits.slice(4);
  if (digits.length === PHONE_LENGTH + 1 && digits.startsWith('0')) return digits.slice(1);

  return digits;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return PHONE_PATTERN.test(normalisePhone(input));
}

/**
 * Trims a part-typed number to what can still become valid, so a field can
 * reject a stray letter or an eleventh digit as it is keyed in.
 *
 * A country code is dropped the moment it is unambiguous — as soon as there
 * are more digits than a subscriber number holds — rather than only at its
 * full length. Keying `+919833440021` one character at a time never reaches
 * twelve digits, because the tenth would otherwise be the last one accepted.
 */
export function clampPhoneInput(input: string): string {
  let digits = String(input ?? '').replace(/\D/g, '');

  if (digits.length > PHONE_LENGTH && digits.startsWith('0091')) digits = digits.slice(4);
  if (digits.length > PHONE_LENGTH && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > PHONE_LENGTH && digits.startsWith('0')) digits = digits.slice(1);

  return digits.slice(0, PHONE_LENGTH);
}

/** `9833440021` → `98334 40021`. Anything unrecognised is shown unchanged. */
export function formatPhone(value?: string | null): string {
  if (!value) return '';
  const digits = normalisePhone(value);
  if (!PHONE_PATTERN.test(digits)) return String(value);
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** A required number. Always resolves to ten bare digits. */
export const phoneField = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .min(1, 'Mobile number is required')
  .transform(normalisePhone)
  .refine((value) => PHONE_PATTERN.test(value), PHONE_MESSAGE);

/** An optional number. An empty field means "not provided", never an error. */
export const optionalPhoneField = z
  .union([z.literal(''), phoneField])
  .optional()
  .transform((value) => (value ? value : undefined));

/** The input attributes every phone field shares — keyboard, length, autofill. */
export const phoneInputProps = {
  type: 'tel',
  inputMode: 'numeric',
  autoComplete: 'tel',
  // Generous enough that `+91 98334 40021` can be pasted whole — the change
  // handler is what actually holds the value to ten digits.
  maxLength: PHONE_LENGTH + 5,
  pattern: `[0-9]{${PHONE_LENGTH}}`,
  placeholder: PHONE_PLACEHOLDER,
} as const;
