'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff, LogIn } from '@/components/icons';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Enter your email address or mobile number'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * `useSearchParams` reads the `?next=` redirect target, which forces this part
 * of the tree to render on the client — so it sits behind a Suspense boundary.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginFallback() {
  return (
    <AuthLayout title="Sign in" subtitle="Use the email address or mobile number registered with your account.">
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
    </AuthLayout>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, isLoading } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const next = searchParams.get('next') || '/dashboard';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  // Someone already signed in should never sit on the login screen.
  React.useEffect(() => {
    if (!isLoading && user) router.replace(next);
  }, [user, isLoading, router, next]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const account = await login(values.identifier, values.password);
      toast.success(`Welcome back, ${account.name.split(' ')[0]}`);
      router.replace(next);
    } catch (error) {
      if (error instanceof ApiError) {
        // Field-level issues take priority over the banner.
        if (error.issues?.length) {
          for (const issue of error.issues) {
            setError(issue.field as keyof LoginValues, { message: issue.message });
          }
        }
        setFormError(error.message);
      } else {
        setFormError('Could not sign you in. Please try again.');
      }
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email address or mobile number registered with your account."
      footer={
        <p className="text-center text-[13px] text-muted-foreground">
          Invited but not registered yet?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Complete your registration
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-[13px] text-destructive"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <FormField label="Email or mobile number" htmlFor="identifier" required error={errors.identifier?.message}>
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com or +91XXXXXXXXXX"
            invalid={Boolean(errors.identifier)}
            {...register('identifier')}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={Boolean(errors.password)}
            endIcon={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="rounded p-0.5 transition-colors hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
            {...register('password')}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          {!isSubmitting ? <LogIn /> : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
