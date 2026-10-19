import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * `auto` follows the theme (ink box sides on light, paper sides on dark).
 * `onDark` is for photos and other always-dark backgrounds.
 */
type Tone = 'auto' | 'onDark';

const SIDES: Record<Tone, { left: string; right: string; word: string; tagline: string }> = {
  auto: {
    left: 'fill-[#18181B] stroke-[#18181B] dark:fill-[#F4F4F5] dark:stroke-[#F4F4F5]',
    right: 'fill-[#3F3F46] dark:fill-[#A1A1AA]',
    word: 'text-foreground',
    tagline: 'text-muted-foreground',
  },
  onDark: {
    left: 'fill-[#F4F4F5] stroke-[#F4F4F5]',
    right: 'fill-[#A1A1AA]',
    word: 'text-white',
    tagline: 'text-white/55',
  },
};

/**
 * CargoEntry mark: an isometric cargo box with three motion strokes trailing
 * behind it — freight that is already moving.
 */
export function LogoMark({
  tone = 'auto',
  className,
  title = 'CargoEntry',
}: {
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  const sides = SIDES[tone];

  return (
    <svg viewBox="0 0 46 40" className={cn('h-8 w-auto shrink-0', className)} role="img" aria-label={title}>
      {/* Motion strokes */}
      <g stroke="#F26B21" strokeLinecap="round" strokeWidth="2.6">
        <path d="M5.5 16.5H10" opacity="0.55" />
        <path d="M1.8 22H10" />
        <path d="M6.5 27.5H10" opacity="0.55" />
      </g>
      {/* Lid with packing tape */}
      <path d="M26 5.3 37.8 12 26 18.7 14.2 12Z" fill="#F26B21" />
      <path d="M20.1 8.65 31.9 15.35" stroke="#FFB37D" strokeWidth="1.6" strokeLinecap="round" />
      {/* Sides */}
      <path d="M12.85 13.45 25.15 20.5V34.55L12.85 27.5Z" className={sides.left} strokeWidth="0" />
      <path d="M39.15 13.45 26.85 20.5V34.55L39.15 27.5Z" className={sides.right} />
      {/* Handle slot on the right face */}
      <path
        d="M30.2 25.4 35.6 22.3"
        className={sides.left}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.65"
        fill="none"
      />
    </svg>
  );
}

/** Mark plus the two-tone wordmark, with an optional tagline underneath. */
export function Logo({
  tone = 'auto',
  className,
  markClassName,
  tagline,
}: {
  tone?: Tone;
  className?: string;
  markClassName?: string;
  tagline?: string;
}) {
  const sides = SIDES[tone];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark tone={tone} className={markClassName} />
      <span className="min-w-0 leading-none">
        <span className={cn('block text-[18px] font-bold tracking-[-0.02em]', sides.word)}>
          Cargo<span className="text-[#F26B21]">Entry</span>
        </span>
        {tagline ? (
          <span className={cn('mt-1 block truncate text-[11px] font-medium', sides.tagline)}>{tagline}</span>
        ) : null}
      </span>
    </span>
  );
}
