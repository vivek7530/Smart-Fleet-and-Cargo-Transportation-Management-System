'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from '@/components/icons';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { dashboardQuery } from '@/lib/queries';
import { useAuth } from '@/components/auth-provider';
import { AuthLayout } from '@/components/auth/auth-layout';
import { TruckButton, type TruckButtonPhase } from '@/components/auth/truck-button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';

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
    <AuthLayout title="Welcome back" subtitle="Sign in with the email or mobile number registered with your account.">
      <div className="space-y-5">
        {[0, 1].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3.5 w-36 rounded-full" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </AuthLayout>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { login, user, isLoading } = useAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<TruckButtonPhase>('idle');
  const welcomeName = React.useRef('');

  const next = searchParams.get('next') || '/dashboard';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  // Warm everything the sign-in needs while the user is still typing: the
  // destination route's code, and the API's database connection.
  React.useEffect(() => {
    router.prefetch(next);
    void fetch('/api/health', { cache: 'no-store' }).catch(() => undefined);
  }, [router, next]);

  // Someone already signed in should never sit on the login screen — but a
  // sign-in in progress here navigates itself once the truck has left.
  React.useEffect(() => {
    if (phase === 'idle' && !isLoading && user) router.replace(next);
  }, [user, isLoading, router, next, phase]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setPhase('loading');
    try {
      const account = await login(values.identifier, values.password);
      welcomeName.current = account.name.split(' ')[0];
      // Start loading the dashboard now so it is ready when the truck arrives.
      void queryClient.prefetchQuery(dashboardQuery(account.role));
      setPhase('success');
    } catch (error) {
      setPhase('error');
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

  const handleDelivered = React.useCallback(() => {
    toast.success(`Welcome back, ${welcomeName.current}`);
    router.replace(next);
  }, [router, next]);

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with the email or mobile number registered with your account."
      footer={
        <div className="flex items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-[13px]">
          <span className="text-muted-foreground">Invited but not registered yet?</span>
          <Link href="/register" className="ml-auto font-semibold text-primary underline-offset-4 hover:underline">
            Complete registration
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <AnimatePresence initial={false}>
          {formError ? (
            <motion.div
              key="error"
              role="alert"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-[13px] text-destructive">
                <AlertCircle className="mt-px size-[18px] shrink-0" />
                <span>{formError}</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <FormField label="Email or mobile number" htmlFor="identifier" required error={errors.identifier?.message}>
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com or +91XXXXXXXXXX"
            invalid={Boolean(errors.identifier)}
            startIcon={<Mail />}
            className="h-11"
            {...register('identifier')}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            invalid={Boolean(errors.password)}
            startIcon={<Lock />}
            className="h-11"
            endIcon={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            }
            {...register('password')}
          />
        </FormField>

        <TruckButton type="submit" phase={phase} onDelivered={handleDelivered} className="!mt-7">
          Sign in
        </TruckButton>
      </form>
    </AuthLayout>
  );
}
