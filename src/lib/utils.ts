import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class names, letting later Tailwind classes win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "IN_TRANSIT" → "In transit" */
export function humanise(value?: string | null): string {
  if (!value) return '—';
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Deterministic avatar tint derived from the stored colour name. */
export function avatarClasses(color?: string | null): string {
  const map: Record<string, string> = {
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  };
  return map[color ?? 'violet'] ?? map.violet;
}

/** Strips empty values so they never reach the query string. */
export function compact<T extends Record<string, unknown>>(input: T): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '' || value === 'ALL') continue;
    output[key] = String(value);
  }
  return output;
}
