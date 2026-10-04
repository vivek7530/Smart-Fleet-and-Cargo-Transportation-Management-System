'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/format';
import type { SeriesPoint } from '@/lib/types';
import { Sparkline } from '@/components/charts/charts';
import type { ChartPalette } from '@/components/charts/chart-theme';

const TONES = {
  default: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
} as const;

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TONES;
  /** Percentage change against the previous period; null hides the chip. */
  trend?: number | null;
  /** Set when a rising number is bad (expenses, breakdowns). */
  invertTrend?: boolean;
  hint?: React.ReactNode;
  href?: string;
  sparkline?: { data: SeriesPoint[]; dataKey: keyof SeriesPoint; tone?: keyof ChartPalette };
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  trend,
  invertTrend,
  hint,
  href,
  sparkline,
  className,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight tabular">{value}</p>
        </div>
        {icon ? (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5',
              TONES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {trend !== undefined && trend !== null ? <TrendChip value={trend} invert={invertTrend} /> : null}
          {hint ? <p className="truncate text-2xs text-muted-foreground">{hint}</p> : null}
        </div>

        {sparkline ? (
          <div className="h-10 w-24 shrink-0">
            <Sparkline data={sparkline.data} dataKey={sparkline.dataKey} tone={sparkline.tone} />
          </div>
        ) : null}
      </div>

      {href ? (
        <ArrowRight className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </>
  );

  const classes = cn(
    'surface-card group relative p-5 transition-shadow',
    href && 'hover:shadow-md focus-ring',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}

function TrendChip({ value, invert }: { value: number; invert?: boolean }) {
  const flat = Math.abs(value) < 0.05;
  // A rise in expenses is a bad thing, so the colour is inverted for those cards.
  const positive = invert ? value < 0 : value > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium tabular',
        flat
          ? 'bg-muted text-muted-foreground'
          : positive
            ? 'bg-success-soft text-success'
            : 'bg-destructive-soft text-destructive',
      )}
      title="Compared with the previous period"
    >
      {flat ? (
        <Minus className="size-3" />
      ) : value > 0 ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {formatPercent(value)}
    </span>
  );
}

/** Compact figure used in detail panels and summary strips. */
export function MiniStat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  className?: string;
}) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-[15px] font-semibold tabular',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-destructive',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}
