'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Card surface. Rises in the first time it scrolls into view, and a soft
 * brand-tinted spotlight follows the pointer while hovered.
 */
const Card = React.forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(({ className, onPointerMove, ...props }, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, y: 14 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '0px 0px -40px 0px' }}
    transition={{ duration: 0.5, ease: EASE_OUT }}
    onPointerMove={(event) => {
      onPointerMove?.(event);
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
      event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    }}
    className={cn(
      'surface-card relative isolate text-card-foreground transition-[box-shadow,border-color] duration-300 hover:border-foreground/[0.14] hover:shadow-md',
      "before:pointer-events-none before:absolute before:inset-0 before:z-[-1] before:rounded-[inherit] before:opacity-0 before:transition-opacity before:duration-500 before:content-[''] hover:before:opacity-100",
      'before:bg-[radial-gradient(480px_circle_at_var(--spot-x,50%)_var(--spot-y,0%),hsl(var(--foreground)/0.035),transparent_45%)]',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold leading-tight tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[13px] text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2 p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
