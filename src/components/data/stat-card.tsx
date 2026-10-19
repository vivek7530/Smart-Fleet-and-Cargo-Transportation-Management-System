'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ArrowRight, Minus } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/format';
import type { SeriesPoint } from '@/lib/types';
import { Sparkline } from '@/components/charts/charts';
import type { ChartPalette } from '@/components/charts/chart-theme';
import { CountUp, riseItem } from '@/components/motion/primitives';

const TONES = {
  default: { tile: 'bg-primary-soft text-primary', glow: 'bg-primary/20' },
  success: { tile: 'bg-success-soft text-success', glow: 'bg-success/20' },
  warning: { tile: 'bg-warning-soft text-warning', glow: 'bg-warning/20' },
  danger: { tile: 'bg-destructive-soft text-destructive', glow: 'bg-destructive/20' },
  info: { tile: 'bg-info-soft text-info', glow: 'bg-info/20' },
  neutral: { tile: 'bg-muted text-foreground/70', glow: 'bg-foreground/10' },
} as const;

const MotionLink = motion.create(Link);

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
  const palette = TONES[tone];

  const content = (
    <>
      <div className="relative flex items-start justify-between gap-3">
        {icon ? (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 [&_svg]:size-5',
              palette.tile,
            )}
          >
            {icon}
          </span>
        ) : null}
        {trend !== undefined && trend !== null ? <TrendChip value={trend} invert={invertTrend} /> : null}
      </div>

      <div className="relative mt-4 min-w-0">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-2xl font-semibold tracking-tight">
          <CountUp value={value} />
        </p>
      </div>

      <div className="relative mt-3 flex min-h-8 items-end justify-between gap-3">
        {hint ? <p className="min-w-0 truncate text-xs text-muted-foreground">{hint}</p> : <span />}

        {sparkline ? (
          <div className="h-9 w-24 shrink-0">
            <Sparkline data={sparkline.data} dataKey={sparkline.dataKey} tone={sparkline.tone} />
          </div>
        ) : href ? (
          <ArrowRight className="size-[18px] shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
        ) : null}
      </div>
    </>
  );

  const classes = cn(
    'surface-card group relative block overflow-hidden p-5 transition-[box-shadow,transform,border-color] duration-300',
    href && 'hover:-translate-y-0.5 hover:border-foreground/[0.14] hover:shadow-md focus-ring',
    className,
  );

  if (href) {
    return (
      <MotionLink href={href} className={classes} variants={riseItem}>
        {content}
      </MotionLink>
    );
  }

  return (
    <motion.div className={classes} variants={riseItem}>
      {content}
    </motion.div>
  );
}

function TrendChip({ value, invert }: { value: number; invert?: boolean }) {
  const flat = Math.abs(value) < 0.05;
  // A rise in expenses is a bad thing, so the colour is inverted for those cards.
  const positive = invert ? value < 0 : value > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11.5px] font-semibold leading-none tabular',
        flat
          ? 'bg-muted text-muted-foreground'
          : positive
            ? 'bg-success-soft text-success'
            : 'bg-destructive-soft text-destructive',
      )}
      title="Compared with the previous period"
    >
      {flat ? (
        <Minus className="size-3.5" />
      ) : value > 0 ? (
        <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
      ) : (
        <ArrowDownRight className="size-3.5" strokeWidth={2.2} />
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
    <div className={cn('space-y-1', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-base font-bold tabular',
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
