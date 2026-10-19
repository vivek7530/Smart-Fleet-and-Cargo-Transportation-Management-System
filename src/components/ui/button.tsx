'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { usePathname } from 'next/navigation';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import { ButtonLoader, loaderForPath, type LoaderKind } from './button-loaders';

const buttonVariants = cva(
  'relative isolate inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.1)] hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline:
          'border border-input bg-surface shadow-card hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        subtle: 'bg-primary-soft text-primary hover:bg-primary/15',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        'destructive-outline':
          'border border-destructive/30 text-destructive bg-surface hover:bg-destructive-soft',
        success:
          'bg-success text-success-foreground shadow-xs hover:bg-success/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-[13px] [&_svg]:size-4',
        xs: 'h-7 rounded-lg px-2.5 text-xs [&_svg]:size-3.5',
        lg: 'h-11 rounded-lg px-5 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/** Solid fills get a glossy sweep across on hover; light variants do not need it. */
const SHINE_VARIANTS = new Set(['default', 'destructive', 'success', undefined, null]);

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a busy animation and blocks interaction while a mutation is in flight. */
  loading?: boolean;
  /**
   * Which busy animation to play. Defaults to the one for the current section
   * (fuel drop on /fuel, steering wheel on /drivers…); destructive buttons use the bin.
   */
  loader?: LoaderKind;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, loader, children, disabled, onPointerDown, ...props },
    ref,
  ) => {
    const [ripples, setRipples] = React.useState<Ripple[]>([]);
    const pathname = usePathname();
    const loaderKind: LoaderKind =
      loader ?? (variant === 'destructive' || variant === 'destructive-outline' ? 'delete' : loaderForPath(pathname));
    const shine = SHINE_VARIANTS.has(variant) && variant !== 'link';
    const shineClasses =
      shine &&
      "before:pointer-events-none before:absolute before:inset-y-0 before:-left-[60%] before:z-[-1] before:w-1/2 before:-skew-x-12 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:transition-[left] before:duration-700 before:ease-out before:content-[''] hover:before:left-[130%]";

    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size }), shineClasses, className)}
          ref={ref}
          onPointerDown={onPointerDown}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const isIcon = size === 'icon' || size === 'icon-sm';

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event);
      if (variant === 'link' || event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      setRipples((current) => [
        ...current.slice(-3),
        { id: Date.now() + Math.random(), x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size },
      ]);
    };

    return (
      <button
        className={cn(buttonVariants({ variant, size }), shineClasses, loading && 'disabled:opacity-100', className)}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onPointerDown={handlePointerDown}
        {...props}
      >
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="pointer-events-none absolute z-[-1] animate-ripple rounded-full bg-current"
            style={{ left: ripple.x, top: ripple.y, width: ripple.size, height: ripple.size }}
            onAnimationEnd={() => setRipples((current) => current.filter((item) => item.id !== ripple.id))}
            aria-hidden
          />
        ))}

        {!loading ? (
          children
        ) : isIcon ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          // Kept in layout (invisible) so the button keeps its width while busy.
          <span className="invisible inline-flex items-center gap-2">{children}</span>
        )}
        {loading && !isIcon ? <ButtonLoader kind={loaderKind} /> : null}
        {loading ? <span className="sr-only">Working…</span> : null}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
