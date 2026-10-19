'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the error state; pair with an inline message below the field. */
  invalid?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', invalid, startIcon, endIcon, ...props }, ref) => {
    const field = (
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-10 w-full rounded-lg border border-input bg-surface px-3 py-1 text-sm shadow-card transition-[border-color,box-shadow] duration-200',
          'placeholder:text-muted-foreground/70',
          'hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:border-ring',
          'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          invalid && 'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
          startIcon && 'pl-10',
          endIcon && 'pr-10',
          className,
        )}
        {...props}
      />
    );

    if (!startIcon && !endIcon) return field;

    return (
      <div className="relative">
        {startIcon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-[18px]">
            {startIcon}
          </span>
        ) : null}
        {field}
        {endIcon ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-[18px]">
            {endIcon}
          </span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex min-h-20 w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm shadow-card transition-[border-color,box-shadow] duration-200',
      'placeholder:text-muted-foreground/70',
      'hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:border-ring',
      'disabled:cursor-not-allowed disabled:opacity-60',
      invalid && 'border-destructive focus-visible:ring-destructive/30',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Input, Textarea };
