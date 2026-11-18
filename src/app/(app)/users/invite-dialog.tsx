'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Mail, Send, Smartphone, UserPlus } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { optionalPhoneField } from '@/lib/phone';
import type { Invitation, Page, Role, UserRecord } from '@/lib/types';
import { ResourceDialog, useMutationErrors } from '@/components/data/resource-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/auth-provider';

/**
 * At least one contact method is required, but neither is mandatory on its own.
 * Whichever channel delivers the invitation becomes locked for the invitee.
 */
const inviteSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the person’s full name').max(120),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
    mobile: optionalPhoneField,
    role: z.enum(['MANAGER', 'DRIVER']),
    channel: z.enum(['EMAIL', 'MOBILE']),
    /** Drivers only; '' means the administrator left it for later. */
    manager: z.string(),
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
    defaultValues: { name: '', email: '', mobile: '', role: defaultRole, channel: 'EMAIL', manager: '' },
  });

  const { bannerError, setBannerError, handleError } = useMutationErrors<keyof InviteValues>((field, message) =>
    form.setError(field, { message }),
  );

  React.useEffect(() => {
    if (!open) {
      // Drop the finished invitation once the close animation has played, so
      // the next open starts on a fresh form instead of the old link.
      const timer = setTimeout(() => setResult(null), 250);
      return () => clearTimeout(timer);
    }
    setResult(null);
    setBannerError(null);
    form.reset({ name: '', email: '', mobile: '', role: defaultRole, channel: 'EMAIL', manager: '' });
  }, [open, defaultRole, form, setBannerError]);

  const mutation = useMutation({
    mutationFn: (values: InviteValues) =>
      api.post<InviteResult>('/users/invite', {
        name: values.name,
        email: values.email || undefined,
        mobile: values.mobile || undefined,
        role: values.role,
        channel: values.channel,
        // Only ever sent for a driver; the server ignores it otherwise.
        manager: values.role === 'DRIVER' && values.manager ? values.manager : undefined,
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
  const role = form.watch('role');
  const errors = form.formState.errors;

  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Only an administrator chooses; a manager's own drivers land on their roster
  // server-side, so the list is never fetched for them.
  const { data: managers } = useQuery({
    queryKey: ['/users', 'manager-options'],
    queryFn: () => api.get<Page<UserRecord>>('/users', { role: 'MANAGER', status: 'ACTIVE', limit: 100 }),
    enabled: open && isAdmin,
  });

  if (result) return <InvitationCreated open={open} result={result} onClose={() => onOpenChange(false)} />;

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
          {(['MANAGER', 'DRIVER'] as const).map((option) => {
            // A manager may only onboard drivers, so the other card is inert.
            const locked = !isAdmin && option === 'MANAGER';
            return (
              <button
                key={option}
                type="button"
                disabled={locked}
                onClick={() => form.setValue('role', option)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors focus-ring',
                  role === option ? 'border-primary bg-primary-soft' : 'border-input hover:bg-accent/60',
                  locked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <UserPlus className="size-3.5" />
                  {option === 'MANAGER' ? 'Manager' : 'Driver'}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {option === 'MANAGER'
                    ? locked
                      ? 'Administrators only'
                      : 'Runs day-to-day operations'
                    : 'Drives and reports from the road'}
                </span>
              </button>
            );
          })}
        </div>
      </FormField>

      {role === 'DRIVER' ? (
        isAdmin ? (
          <FormField
            label="Works under"
            error={errors.manager?.message}
            hint="The manager who will see this driver, their trips and their claims. Can be set later."
          >
            <Select
              value={form.watch('manager') || 'NONE'}
              onValueChange={(value) => form.setValue('manager', value === 'NONE' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No manager yet</SelectItem>
                {(managers?.items ?? []).map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : (
          <div className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            This driver joins <span className="font-medium text-foreground">your</span> roster — only you and
            the administrators will see them.
          </div>
        )
      ) : null}

      <FormField label="Full name" htmlFor="invite-name" required error={errors.name?.message}>
        <Input
          id="invite-name"

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
        <PhoneInput id="invite-mobile" invalid={Boolean(errors.mobile)} {...form.register('mobile')} />
      </FormField>
    </ResourceDialog>
  );
}

/**
 * No email or SMS provider is wired up in this build, so the generated link is
 * handed straight back to the administrator to share.
 */
function InvitationCreated({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: InviteResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.invitationLink);
    setCopied(true);
    toast.success('Invitation link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ResourceDialog
      open={open}
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
