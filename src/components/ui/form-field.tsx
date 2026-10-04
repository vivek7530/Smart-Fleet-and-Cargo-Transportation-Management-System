'use client';

import * as React from 'react';
import { AlertCircle } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Inline error message rendered beneath the control. */
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a control with its label, hint and inline validation message so every
 * form in the app reports errors the same way.
 */
export function FormField({ label, htmlFor, required, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-destructive" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Grid used inside dialogs to lay fields out two-up on wider screens. */
export function FormGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-0.5">
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
