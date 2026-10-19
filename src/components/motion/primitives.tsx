'use client';

import * as React from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'motion/react';
import { cn } from '@/lib/utils';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** Children that use `riseItem` (or `StaggerItem`) enter one after another. */
export function Stagger({
  className,
  children,
  as = 'div',
  ...props
}: React.ComponentProps<typeof motion.div> & { as?: 'div' | 'section' }) {
  // Both elements take identical props; the cast keeps TS from comparing handler element types.
  const Component = (as === 'section' ? motion.section : motion.div) as typeof motion.div;
  return (
    <Component variants={staggerParent} initial="hidden" animate="show" className={className} {...props}>
      {children}
    </Component>
  );
}

export function StaggerItem({ className, ...props }: React.ComponentProps<typeof motion.div>) {
  return <motion.div variants={riseItem} className={className} {...props} />;
}

/** Soft entrance for content that replaces a skeleton. */
export function FadeIn({
  className,
  delay = 0,
  ...props
}: React.ComponentProps<typeof motion.div> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE_OUT }}
      className={className}
      {...props}
    />
  );
}

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/;

/**
 * Counts a formatted figure up to its value ("₹2,84,500", "₹12.4L", "47").
 * Prefix, suffix, grouping and decimals are taken from the formatted string,
 * so callers keep passing whatever their formatter produced.
 */
export function CountUp({ value, duration = 1.1, className }: { value: React.ReactNode; duration?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(0);

  const parsed = React.useMemo(() => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value);
    const match = text.match(NUMBER_PATTERN);
    if (!match || match.index === undefined) return null;
    const raw = match[0];
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const formatter = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: raw.includes(','),
    });
    return {
      target: Number.parseFloat(raw.replace(/,/g, '')),
      prefix: text.slice(0, match.index),
      suffix: text.slice(match.index + raw.length),
      format: (n: number) => formatter.format(n),
      text,
    };
  }, [value]);

  // The transformer reads the latest format through a ref so a new value never
  // needs a new MotionValue.
  const formatRef = React.useRef(parsed);
  formatRef.current = parsed;
  const display = useTransform(progress, (latest) => {
    const current = formatRef.current;
    if (!current) return '';
    if (latest === current.target) return current.text;
    return `${current.prefix}${current.format(latest)}${current.suffix}`;
  });

  React.useEffect(() => {
    if (!parsed || !inView) return;
    if (reduceMotion) {
      progress.set(parsed.target);
      return;
    }
    // Animates from wherever the figure currently is, so a filter change glides.
    const controls = animate(progress, parsed.target, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [parsed, inView, duration, reduceMotion, progress]);

  if (!parsed) return <span className={className}>{value}</span>;

  return (
    <motion.span ref={ref} className={cn('tabular', className)} aria-label={parsed.text}>
      {display}
    </motion.span>
  );
}
