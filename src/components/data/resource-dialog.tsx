'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  size?: 'sm' | 'default' | 'lg' | 'xl';
  loading?: boolean;
  /** Banner error shown above the fields (validation issues stay inline). */
  error?: string | null;
  onSubmit: (event: React.FormEvent) => void;
  children: React.ReactNode;
  footerExtra?: React.ReactNode;
  submitVariant?: 'default' | 'destructive';
  submitDisabled?: boolean;
}

/**
 * Form dialog used by every create/edit flow: scrollable body, sticky footer,
 * banner for server errors and a submit button that blocks while saving.
 */
export function ResourceDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  size = 'default',
  loading = false,
  error,
  onSubmit,
  children,
  footerExtra,
  submitVariant = 'default',
  submitDisabled,
}: ResourceDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-save would leave the user unsure whether it succeeded.
        if (loading && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form onSubmit={onSubmit} className="contents" noValidate>
          <DialogBody className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] text-destructive"
              >
                <AlertCircle className="mt-px size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {children}
          </DialogBody>

          <DialogFooter>
            {footerExtra ? <div className="mr-auto">{footerExtra}</div> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" size="sm" variant={submitVariant} loading={loading} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shared error handling for mutations: pushes field issues back into the form
 * and returns the banner message.
 */
export function useMutationErrors<TFieldName extends string>(
  setFieldError: (field: TFieldName, message: string) => void,
  fallback = 'Could not save your changes. Please try again.',
) {
  const [bannerError, setBannerError] = React.useState<string | null>(null);

  // Signature kept to a single argument so it can be passed straight to
  // react-query's `onError`, which also supplies variables and context.
  const handleError = React.useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        for (const issue of error.issues ?? []) {
          setFieldError(issue.field as TFieldName, issue.message);
        }
        setBannerError(error.message);
        // A conflict or permission problem deserves a toast too — it is rarely
        // caused by the field the user is looking at.
        if (error.status === 409 || error.status === 403) toast.error(error.message);
      } else {
        setBannerError(fallback);
        toast.error(fallback);
      }
    },
    [setFieldError, fallback],
  );

  return { bannerError, setBannerError, handleError };
}
