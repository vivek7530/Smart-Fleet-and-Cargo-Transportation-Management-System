'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Lock, MailCheck, ShieldCheck, SmartphoneNfc } from '@/components/icons';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { InvitationSummary, SessionUser } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/ui/form-field';
import { Tooltip } from '@/components/ui/misc';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.union([z.literal(''), z.string().email('Enter a valid email address')]),
    mobile: z.union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9\s-]{8,18}$/, 'Enter a valid mobile number'),
    ]),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[a-z]/, 'Add at least one lowercase letter')
      .regex(/[A-Z]/, 'Add at least one uppercase letter')
      .regex(/[0-9]/, 'Add at least one number'),
    confirmPassword: z.string().min(1, 'Re-enter your password'),
    licenseNumber: z.string().trim().max(60).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerSchema>;

/**
 * The invitation token arrives in the query string, so the part of the tree
 * that reads it renders on the client behind a Suspense boundary.
 */
export default function RegisterPage() {
  return (
    <React.Suspense fallback={<RegisterSkeleton />}>
      <RegisterEntry />
    </React.Suspense>
  );
}

function RegisterEntry() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  if (!token) return <MissingToken />;
  return <RegisterForm token={token} />;
}

function RegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    data: invitation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      const result = await api.get<{ invitation: InvitationSummary }>(
        `/auth/invitation/${encodeURIComponent(token)}`,
      );
      return result.invitation;
    },
    retry: false,
  });

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', mobile: '', password: '', confirmPassword: '', licenseNumber: '' },
  });

  // Pre-fill from the invitation once it resolves.
  React.useEffect(() => {
    if (!invitation) return;
    form.reset({
      name: invitation.name,
      email: invitation.email ?? '',
      mobile: invitation.mobile ?? '',
      password: '',
      confirmPassword: '',
      licenseNumber: '',
    });
  }, [invitation, form]);

  if (isLoading) return <RegisterSkeleton />;
  if (error || !invitation) return <InvalidInvitation error={error} />;

  const lockedField = invitation.lockedField;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.post<{ user: SessionUser }>('/auth/register', {
        token,
        name: values.name,
        password: values.password,
        confirmPassword: values.confirmPassword,
        // The locked channel is never submitted — the server owns that value.
        email: lockedField === 'email' ? undefined : values.email || undefined,
        mobile: lockedField === 'mobile' ? undefined : values.mobile || undefined,
        licenseNumber: values.licenseNumber || undefined,
      });

      await refresh();
      toast.success(`Welcome to CargoEntry, ${result.user.name.split(' ')[0]}`);
      router.replace('/dashboard');
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        for (const issue of submitError.issues ?? []) {
          form.setError(issue.field as keyof RegisterValues, { message: issue.message });
        }
        setFormError(submitError.message);
      } else {
        setFormError('Could not complete your registration. Please try again.');
      }
    }
  });

  return (
    <AuthLayout
      scene="register"
      title="Complete your registration"
      subtitle={
        <>
          You were invited as <span className="font-medium text-foreground">{invitation.role.toLowerCase()}</span>.
          Set a password to activate your account.
        </>
      }
      footer={
        <p className="text-center text-[13px] text-muted-foreground">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in instead
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/45 px-3.5 py-2.5 text-xs">
          {lockedField === 'email' ? (
            <MailCheck className="size-4 shrink-0 text-primary" />
          ) : (
            <SmartphoneNfc className="size-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Invited by {lockedField === 'email' ? 'email' : 'mobile'} ·{' '}
              <span className="text-muted-foreground">
                {lockedField === 'email' ? invitation.email : invitation.mobile}
              </span>
            </p>
            <p className="mt-0.5 text-muted-foreground">
              This cannot be changed. Invitation expires {formatDate(invitation.expiresAt)}.
            </p>
          </div>
        </div>

        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-[13px] text-destructive"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <FormField label="Full name" htmlFor="name" required error={form.formState.errors.name?.message}>
          <Input id="name" autoComplete="name" invalid={Boolean(form.formState.errors.name)} {...form.register('name')} />
        </FormField>

        {/* The invited channel is locked; the other one can be filled in here. */}
        <FormField
          label={
            <span className="inline-flex items-center gap-1.5">
              Email address
              {lockedField === 'email' ? <LockedTag /> : null}
            </span>
          }
          htmlFor="email"
          required={lockedField === 'email'}
          error={form.formState.errors.email?.message}
          hint={lockedField === 'mobile' ? 'Optional — add it now or later from your profile.' : undefined}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            readOnly={lockedField === 'email'}
            disabled={lockedField === 'email'}
            placeholder={lockedField === 'mobile' ? 'you@company.com' : undefined}
            invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
        </FormField>

        <FormField
          label={
            <span className="inline-flex items-center gap-1.5">
              Mobile number
              {lockedField === 'mobile' ? <LockedTag /> : null}
            </span>
          }
          htmlFor="mobile"
          required={lockedField === 'mobile'}
          error={form.formState.errors.mobile?.message}
          hint={lockedField === 'email' ? 'Optional — add it now or later from your profile.' : undefined}
        >
          <Input
            id="mobile"
            type="tel"
            autoComplete="tel"
            readOnly={lockedField === 'mobile'}
            disabled={lockedField === 'mobile'}
            placeholder={lockedField === 'email' ? '+91XXXXXXXXXX' : undefined}
            invalid={Boolean(form.formState.errors.mobile)}
            {...form.register('mobile')}
          />
        </FormField>

        {invitation.role === 'DRIVER' ? (
          <FormField
            label="Driving licence number"
            htmlFor="licenseNumber"
            hint="Optional — you can add this later from your profile."
            error={form.formState.errors.licenseNumber?.message}
          >
            <Input id="licenseNumber" placeholder="MH12 20180004561" {...form.register('licenseNumber')} />
          </FormField>
        ) : null}

        <FormField
          label="Password"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
          hint="At least 8 characters with an uppercase letter, a lowercase letter and a number."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(form.formState.errors.password)}
            {...form.register('password')}
          />
        </FormField>

        <FormField
          label="Confirm password"
          htmlFor="confirmPassword"
          required
          error={form.formState.errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(form.formState.errors.confirmPassword)}
            {...form.register('confirmPassword')}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {!form.formState.isSubmitting ? <ShieldCheck /> : null}
          Create my account
        </Button>
      </form>
    </AuthLayout>
  );
}

function LockedTag() {
  return (
    <Tooltip label="This is the contact the invitation was sent to and cannot be changed.">
      <span>
        <Badge variant="neutral" size="sm" className="cursor-help gap-1">
          <Lock className="size-2.5" />
          Locked
        </Badge>
      </span>
    </Tooltip>
  );
}

function MissingToken() {
  return (
    <AuthLayout
      scene="register"
      title="Registration link required"
      subtitle="Registration is by invitation only. Open the link your administrator sent you by email or SMS."
      footer={
        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="rounded-lg border bg-muted/45 p-4 text-[13px] leading-relaxed text-muted-foreground">
        Your invitation link looks like{' '}
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs">/register?token=…</code>. If your link has
        expired, ask your administrator to send a new invitation.
      </div>
    </AuthLayout>
  );
}

function InvalidInvitation({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError ? error.message : 'This invitation link is not valid or has expired.';

  return (
    <AuthLayout scene="register" title="Invitation unavailable" subtitle={message}>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-[13px] text-destructive">
          <AlertCircle className="mt-px size-4 shrink-0" />
          <span>Ask your administrator to send you a fresh invitation link.</span>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">
            Go to sign in
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </AuthLayout>
  );
}

function RegisterSkeleton() {
  return (
    <AuthLayout scene="register" title="Complete your registration" subtitle="Checking your invitation…">
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </AuthLayout>
  );
}
