import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat('en-IN');

export function formatCurrency(value?: number | null, precise = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return (precise ? currencyPrecise : currency).format(value);
}

/** Short form for KPI cards and chart axes, e.g. ₹12.4L. */
export function formatCurrencyCompact(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return compactCurrency.format(value);
}

export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return number.format(value);
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

export function formatDate(value?: string | Date | null, pattern = 'd MMM yyyy'): string {
  const date = toDate(value);
  return date ? format(date, pattern) : '—';
}

export function formatDateTime(value?: string | Date | null): string {
  return formatDate(value, "d MMM yyyy, h:mm a");
}

export function formatRelative(value?: string | Date | null): string {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

/** Value for an <input type="date">. */
export function toDateInput(value?: string | Date | null): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}

/** Whole days until a date — negative once it has passed. */
export function daysUntil(value?: string | Date | null): number | null {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export function formatWeight(tons?: number | null): string {
  if (tons === null || tons === undefined) return '—';
  return `${number.format(tons)} t`;
}

export function formatDistance(km?: number | null): string {
  if (km === null || km === undefined) return '—';
  return `${number.format(km)} km`;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
