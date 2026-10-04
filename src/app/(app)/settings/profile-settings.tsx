'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Lock, Save, ShieldCheck } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate, toDateInput } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { useMutationErrors } from '@/components/data/resource-dialog';
import { PageHeader } from '@/components/data/list-toolbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, Separator, Tooltip } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  mobile: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,18}$/, 'Enter a valid mobile number'),
  ]),
  designation: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  licenseExpiry: z.string().optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[a-z]/, 'Add at least one lowercase letter')
      .regex(/[A-Z]/, 'Add at least one uppercase letter')
      .regex(/[0-9]/, 'Add at least one number'),
    confirmPassword: z.string().min(1, 'Re-enter the new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

/** Shared by /settings (staff) and /profile (drivers). */
export function ProfileSettings({ title, description }: { title: string; description: string }) {
  const { user, refresh } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} color={user.avatarColor} size="xl" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{user.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {user.designation ?? humanise(user.role)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusBadge status={user.role} dot={false} size="sm" />
                  <StatusBadge status={user.status} size="sm" />
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <dl className="space-y-3 text-[13px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="min-w-0 truncate text-right">
                  {user.email ?? '—'}
                  {user.lockedContactField === 'email' ? <LockedTag /> : null}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Mobile</dt>
                <dd className="min-w-0 truncate text-right tabular">
                  {user.mobile ?? '—'}
                  {user.lockedContactField === 'mobile' ? <LockedTag /> : null}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Member since</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <ProfileForm user={user} onSaved={refresh} />
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}

function LockedTag() {
  return (
    <Tooltip label="This is the contact your invitation was sent to and cannot be changed.">
      <span className="ml-1.5 inline-flex align-middle">
        <Badge variant="neutral" size="sm" className="cursor-help gap-0.5">
          <Lock className="size-2.5" />
          locked
        </Badge>
      </span>
    </Tooltip>
  );
}

function ProfileForm({ user, onSaved }: { user: SessionUser; onSaved: () => Promise<void> }) {
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
      email: user.email ?? '',
      mobile: user.mobile ?? '',
      designation: user.designation ?? '',
      address: '',
      licenseNumber: user.licenseNumber ?? '',
      licenseExpiry: toDateInput(user.licenseExpiry),
      emergencyContactName: '',
      emergencyContactPhone: '',
    },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof ProfileValues>((field, message) =>
    form.setError(field, { message }),
  );

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      api.patch('/auth/profile', {
        name: values.name,
        // The locked contact is never sent — the server ignores it anyway.
        email: user.lockedContactField === 'email' ? undefined : values.email || undefined,
        mobile: user.lockedContactField === 'mobile' ? undefined : values.mobile || undefined,
        designation: values.designation || undefined,
        address: values.address || undefined,
        licenseNumber: values.licenseNumber || undefined,
        licenseExpiry: values.licenseExpiry || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
      }),
    async onSuccess() {
      await onSaved();
      toast.success('Profile updated');
    },
    onError: handleError,
  });

  const errors = form.formState.errors;
  const isDriver = user.role === 'DRIVER';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>
          The contact your invitation was sent to is locked; you can fill in the other one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            setBannerError(null);
            mutation.mutate(values);
          })}
        >
          {bannerError ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] text-destructive">
              {bannerError}
            </p>
          ) : null}

          <FormGrid>
            <FormField label="Full name" htmlFor="profile-name" required error={errors.name?.message}>
              <Input id="profile-name" invalid={Boolean(errors.name)} {...form.register('name')} />
            </FormField>

            <FormField label="Designation" htmlFor="profile-designation">
              <Input id="profile-designation" placeholder="Operations Manager" {...form.register('designation')} />
            </FormField>

            <FormField
              label={
                <span className="inline-flex items-center gap-1.5">
                  Email
                  {user.lockedContactField === 'email' ? <LockedTag /> : null}
                </span>
              }
              htmlFor="profile-email"
              error={errors.email?.message}
            >
              <Input
                id="profile-email"
                type="email"
                disabled={user.lockedContactField === 'email'}
                invalid={Boolean(errors.email)}
                {...form.register('email')}
              />
            </FormField>

            <FormField
              label={
                <span className="inline-flex items-center gap-1.5">
                  Mobile
                  {user.lockedContactField === 'mobile' ? <LockedTag /> : null}
                </span>
              }
              htmlFor="profile-mobile"
              error={errors.mobile?.message}
            >
              <Input
                id="profile-mobile"
                type="tel"
                disabled={user.lockedContactField === 'mobile'}
                invalid={Boolean(errors.mobile)}
                {...form.register('mobile')}
              />
            </FormField>

            {isDriver ? (
              <>
                <FormField label="Licence number" htmlFor="profile-licence">
                  <Input id="profile-licence" {...form.register('licenseNumber')} />
                </FormField>
                <FormField label="Licence expiry" htmlFor="profile-licence-expiry">
                  <Input id="profile-licence-expiry" type="date" {...form.register('licenseExpiry')} />
                </FormField>
                <FormField label="Emergency contact" htmlFor="profile-emergency">
                  <Input id="profile-emergency" placeholder="Name" {...form.register('emergencyContactName')} />
                </FormField>
                <FormField label="Emergency phone" htmlFor="profile-emergency-phone">
                  <Input id="profile-emergency-phone" placeholder="+91XXXXXXXXXX" {...form.register('emergencyContactPhone')} />
                </FormField>
              </>
            ) : null}
          </FormGrid>

          <div className="flex justify-end">
            <Button type="submit" loading={mutation.isPending}>
              <Save />
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof PasswordValues>(
    (field, message) => form.setError(field, { message }),
  );

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) => api.post('/auth/change-password', values),
    onSuccess() {
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password updated');
    },
    onError: handleError,
  });

  const errors = form.formState.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Password
        </CardTitle>
        <CardDescription>
          At least 8 characters with an uppercase letter, a lowercase letter and a number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            setBannerError(null);
            mutation.mutate(values);
          })}
        >
          {bannerError ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] text-destructive">
              {bannerError}
            </p>
          ) : null}

          <FormField
            label="Current password"
            htmlFor="current-password"
            required
            error={errors.currentPassword?.message}
          >
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              invalid={Boolean(errors.currentPassword)}
              {...form.register('currentPassword')}
            />
          </FormField>

          <FormGrid>
            <FormField label="New password" htmlFor="new-password" required error={errors.newPassword?.message}>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.newPassword)}
                {...form.register('newPassword')}
              />
            </FormField>

            <FormField
              label="Confirm new password"
              htmlFor="confirm-password"
              required
              error={errors.confirmPassword?.message}
            >
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.confirmPassword)}
                {...form.register('confirmPassword')}
              />
            </FormField>
          </FormGrid>

          <div className="flex justify-end">
            <Button type="submit" variant="outline" loading={mutation.isPending}>
              <KeyRound />
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
