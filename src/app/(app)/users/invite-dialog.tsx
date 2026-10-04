'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Mail, Send, Smartphone, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { Invitation, Role } from '@/lib/types';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * At least one contact method is required, but neither is mandatory on its own.
 * Whichever channel delivers the invitation becomes locked for the invitee.
 */
const inviteSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the person’s full name').max(120),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
    mobile: z.union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9\s-]{8,18}$/, 'Enter a valid mobile number'),
    ]),
    role: z.enum(['MANAGER', 'DRIVER']),
    channel: z.enum(['EMAIL', 'MOBILE']),
  })
  .refine((data) => Boolean(data.email || data.mobile), {
    message: 'Provide an email address or a mobile number',
    path: ['email'],
  })
  .refine((data) => !(data.channel === 'EMAIL' && !data.email), {
    message: 'An email address is required to invite by email',
    path: ['email'],
  })
  .refine((data) => !(data.channel === 'MOBILE' && !data.mobile), {
    message: 'A mobile number is required to invite by mobile',
    path: ['mobile'],
  });

type InviteValues = z.infer<typeof inviteSchema>;

interface InviteResult {
  invitation: Invitation;
  invitationLink: string;
  delivery: { channel: string; to: string };
}

export function InviteUserDialog({
  open,
  onOpenChange,
  defaultRole = 'DRIVER',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRole?: Extract<Role, 'MANAGER' | 'DRIVER'>;
}) {
  const queryClient = useQueryClient();
  const [result, setResult] = React.useState<InviteResult | null>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', mobile: '', role: defaultRole, channel: 'EMAIL' },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof InviteValues>((field, message) =>
    form.setError(field, { message }),
  );

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    setBannerError(null);
    form.reset({ name: '', email: '', mobile: '', role: defaultRole, channel: 'EMAIL' });
  }, [open, defaultRole, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: InviteValues) =>
      api.post<InviteResult>('/users/invite', {
        name: values.name,
        email: values.email || undefined,
        mobile: values.mobile || undefined,
        role: values.role,
        channel: values.channel,
      }),
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['/users'] });
      queryClient.invalidateQueries({ queryKey: ['/users/invitations'] });
      queryClient.invalidateQueries({ queryKey: ['/drivers'] });
      toast.success(`Invitation created for ${data.invitation.name}`);
      // The link is shown so the admin can pass it on directly.
      setResult(data);
    },
    onError: handleError,
  });

  const channel = form.watch('channel');
  const errors = form.formState.errors;

  if (result) return <InvitationCreated result={result} onClose={() => onOpenChange(false)} />;

  return (
    <ResourceDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite someone"
      description="They receive a single-use link to set their password and activate the account."
      submitLabel="Send invitation"
      loading={mutation.isPending}
      error={bannerError}
      onSubmit={form.handleSubmit((values) => {
        setBannerError(null);
        mutation.mutate(values);
      })}
    >
      <FormField label="Role" required>
        <div className="grid grid-cols-2 gap-2">
          {(['MANAGER', 'DRIVER'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => form.setValue('role', role)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-colors focus-ring',
                form.watch('role') === role
                  ? 'border-primary bg-primary-soft'
                  : 'border-input hover:bg-accent/60',
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <UserPlus className="size-3.5" />
                {role === 'MANAGER' ? 'Manager' : 'Driver'}
              </span>
              <span className="mt-0.5 block text-2xs text-muted-foreground">
                {role === 'MANAGER' ? 'Runs day-to-day operations' : 'Drives and reports from the road'}
              </span>
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Full name" htmlFor="invite-name" required error={errors.name?.message}>
        <Input
          id="invite-name"
          placeholder="John Mathew"
          invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
      </FormField>

      <FormField label="Send the invitation by" required>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'EMAIL', label: 'Email', icon: Mail },
              { value: 'MOBILE', label: 'Mobile', icon: Smartphone },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => form.setValue('channel', option.value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors focus-ring',
                channel === option.value ? 'border-primary bg-primary-soft text-primary' : 'border-input hover:bg-accent/60',
              )}
            >
              <option.icon className="size-4" />
              {option.label}
            </button>
          ))}
        </div>
      </FormField>

      <div className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        The contact used to send the invitation is <span className="font-medium text-foreground">locked</span> —
        the invitee can add the other one during registration, but cannot change this one.
      </div>

      <FormField
        label="Email address"
        htmlFor="invite-email"
        required={channel === 'EMAIL'}
        error={errors.email?.message}
        hint={channel === 'MOBILE' ? 'Optional — they can add it themselves later.' : undefined}
      >
        <Input
          id="invite-email"
          type="email"
          placeholder="john@company.com"
          invalid={Boolean(errors.email)}
          {...form.register('email')}
        />
      </FormField>

      <FormField
        label="Mobile number"
        htmlFor="invite-mobile"
        required={channel === 'MOBILE'}
        error={errors.mobile?.message}
        hint={channel === 'EMAIL' ? 'Optional — they can add it themselves later.' : undefined}
      >
        <Input
          id="invite-mobile"
          type="tel"
          placeholder="+91XXXXXXXXXX"
          invalid={Boolean(errors.mobile)}
          {...form.register('mobile')}
        />
      </FormField>
    </ResourceDialog>
  );
}

/**
 * No email or SMS provider is wired up in this build, so the generated link is
 * handed straight back to the administrator to share.
 */
function InvitationCreated({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.invitationLink);
    setCopied(true);
    toast.success('Invitation link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ResourceDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Invitation ready"
      description={`${result.invitation.name} has been invited as ${result.invitation.role.toLowerCase()}.`}
      submitLabel="Done"
      cancelLabel="Close"
      onSubmit={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-center gap-3 rounded-lg border bg-success-soft/50 px-3.5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
          <Send className="size-4" />
        </span>
        <div className="min-w-0 text-[13px]">
          <p className="font-medium">
            Sent by {result.delivery.channel.toLowerCase()} to{' '}
            <span className="text-muted-foreground">{result.delivery.to}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {formatDate(result.invitation.expiresAt)} · single use
          </p>
        </div>
      </div>

      <FormField
        label="Invitation link"
        hint="No email or SMS provider is configured in this build — share this link directly."
      >
        <div className="flex gap-2">
          <Input readOnly value={result.invitationLink} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy invitation link">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
      </FormField>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="neutral" size="sm">
          {result.invitation.role}
        </Badge>
        <span>
          The {result.invitation.channel === 'EMAIL' ? 'email address' : 'mobile number'} above cannot be changed
          by the invitee.
        </span>
      </div>
    </ResourceDialog>
  );
}
