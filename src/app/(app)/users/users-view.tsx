'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Copy,
  Mail,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { Invitation, Role, UserRecord } from '@/lib/types';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { InviteUserDialog } from './invite-dialog';

const ROLES = ['ADMIN', 'MANAGER', 'DRIVER'];
const STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED'];

/** Shared by /users (everyone) and /managers (role-filtered). */
export function UsersView({
  title,
  description,
  fixedRole,
}: {
  title: string;
  description: string;
  fixedRole?: Extract<Role, 'MANAGER' | 'DRIVER'>;
}) {
  const queryClient = useQueryClient();
  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['role', 'status'] });

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [suspending, setSuspending] = React.useState<UserRecord | null>(null);
  const [deleting, setDeleting] = React.useState<UserRecord | null>(null);

  const params = React.useMemo(
    () => (fixedRole ? { ...list.params, role: fixedRole } : list.params),
    [list.params, fixedRole],
  );

  const query = useInfiniteList<UserRecord>({ path: '/users', params });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/users'] });
    queryClient.invalidateQueries({ queryKey: ['/drivers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch(`/users/${input.id}`, { status: input.status }),
    onSuccess(_data, variables) {
      invalidate();
      toast.success(variables.status === 'ACTIVE' ? 'Account reactivated' : 'Account suspended');
      setSuspending(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update this account.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess() {
      invalidate();
      toast.success(`${deleting?.name} was removed`);
      setDeleting(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete this account.')),
  });

  const columns: Column<UserRecord>[] = [
    {
      key: 'person',
      header: 'Person',
      width: 'minmax(220px, 1.8fr)',
      sortKey: 'name',
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.name} color={user.avatarColor} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.designation ?? humanise(user.role)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      width: 'minmax(190px, 1.4fr)',
      hideBelow: 'md',
      render: (user) => (
        <div className="min-w-0 space-y-0.5 text-xs">
          {user.email ? (
            <p className="flex items-center gap-1.5 truncate">
              <Mail className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{user.email}</span>
              {user.lockedContactField === 'email' ? <LockedPill /> : null}
            </p>
          ) : null}
          {user.mobile ? (
            <p className="flex items-center gap-1.5 truncate">
              <Smartphone className="size-3 shrink-0 text-muted-foreground" />
              <span className="tabular">{user.mobile}</span>
              {user.lockedContactField === 'mobile' ? <LockedPill /> : null}
            </p>
          ) : null}
          {!user.email && !user.mobile ? <span className="text-muted-foreground">—</span> : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 'minmax(100px, 0.7fr)',
      sortKey: 'role',
      hideBelow: 'lg',
      render: (user) => <StatusBadge status={user.role} dot={false} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(110px, 0.8fr)',
      sortKey: 'status',
      render: (user) => <StatusBadge status={user.status} />,
    },
    {
      key: 'lastLogin',
      header: 'Last active',
      width: 'minmax(120px, 0.8fr)',
      sortKey: 'lastLoginAt',
      hideBelow: 'xl',
      render: (user) => (
        <span className="text-xs text-muted-foreground">
          {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never signed in'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite {fixedRole ? fixedRole.toLowerCase() : 'user'}
          </Button>
        }
      />

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">
            <UsersIcon />
            People
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail />
            Invitations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="mt-4 space-y-5">
          <ListToolbar
            search={list.search}
            onSearchChange={list.setSearch}
            searchPlaceholder="Search by name, email or mobile…"
            total={query.total}
            loadedCount={query.items.length}
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: list.filters.status ?? 'ALL',
                options: optionsFrom(STATUSES, 'All statuses'),
                onChange: (value) => list.setFilter('status', value),
                primary: true,
              },
              ...(fixedRole
                ? []
                : [
                    {
                      key: 'role',
                      label: 'Role',
                      value: list.filters.role ?? 'ALL',
                      options: optionsFrom(ROLES, 'All roles'),
                      onChange: (value: string) => list.setFilter('role', value),
                      primary: true,
                    },
                  ]),
            ]}
          />

          <DataList
            items={query.items}
            columns={columns}
            getRowId={(user) => user.id}
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={() => query.refetch()}
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
            sortBy={list.sortBy}
            sortDir={list.sortDir}
            onSortChange={list.setSort}
            emptyIcon={<UsersIcon />}
            emptyTitle="Nobody here yet"
            emptyDescription="Invite a manager or a driver to get started."
            emptyAction={
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus />
                Invite someone
              </Button>
            }
            mobileRow={(user) => (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Avatar name={user.name} color={user.avatarColor} size="xs" />
                  <span className="font-medium">{user.name}</span>
                  <StatusBadge status={user.status} size="sm" />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {humanise(user.role)} · {user.email ?? user.mobile}
                </p>
              </div>
            )}
            rowActions={(user) => (
              <RowActions
                actions={[
                  {
                    label: 'Suspend account',
                    icon: <Ban />,
                    variant: 'destructive',
                    hidden: user.status !== 'ACTIVE',
                    onSelect: () => setSuspending(user),
                  },
                  {
                    label: 'Reactivate',
                    icon: <UserCheck />,
                    hidden: user.status !== 'SUSPENDED',
                    onSelect: () => setStatus.mutate({ id: user.id, status: 'ACTIVE' }),
                  },
                  {
                    label: 'Delete account',
                    icon: <Trash2 />,
                    variant: 'destructive',
                    separatorBefore: true,
                    hidden: user.role === 'ADMIN',
                    onSelect: () => setDeleting(user),
                  },
                ]}
              />
            )}
          />
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <InvitationsList role={fixedRole} />
        </TabsContent>
      </Tabs>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} defaultRole={fixedRole ?? 'DRIVER'} />

      <ConfirmDialog
        open={Boolean(suspending)}
        onOpenChange={(open) => !open && setSuspending(null)}
        title={`Suspend ${suspending?.name}?`}
        description="They will be signed out immediately and cannot sign in again until reactivated."
        confirmLabel="Suspend account"
        loading={setStatus.isPending}
        onConfirm={() => suspending && setStatus.mutate({ id: suspending.id, status: 'SUSPENDED' })}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This permanently removes the account. Accounts with active trips or an assigned truck cannot be deleted."
        confirmLabel="Delete account"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function LockedPill() {
  return (
    <Badge variant="neutral" size="sm" className="shrink-0 gap-0.5">
      <ShieldCheck className="size-2.5" />
      locked
    </Badge>
  );
}

function InvitationsList({ role }: { role?: string }) {
  const queryClient = useQueryClient();
  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['status'] });
  const [revoking, setRevoking] = React.useState<Invitation | null>(null);

  const params = React.useMemo(() => (role ? { ...list.params, role } : list.params), [list.params, role]);
  const query = useInfiniteList<Invitation>({ path: '/users/invitations', params });

  const resend = useMutation({
    mutationFn: (id: string) => api.post<{ invitationLink: string }>(`/users/invitations/${id}/resend`),
    async onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['/users/invitations'] });
      await navigator.clipboard.writeText(data.invitationLink).catch(() => undefined);
      toast.success('New invitation link created', { description: 'The link has been copied to your clipboard.' });
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not resend this invitation.')),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/users/invitations/${id}/revoke`),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['/users/invitations'] });
      queryClient.invalidateQueries({ queryKey: ['/users'] });
      toast.success('Invitation revoked');
      setRevoking(null);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not revoke this invitation.')),
  });

  const columns: Column<Invitation>[] = [
    {
      key: 'person',
      header: 'Invitee',
      width: 'minmax(200px, 1.6fr)',
      render: (invitation) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{invitation.name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {invitation.channel === 'EMAIL' ? <Mail className="size-3" /> : <Smartphone className="size-3" />}
            {invitation.channel === 'EMAIL' ? invitation.email : invitation.mobile}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: 'minmax(100px, 0.6fr)',
      render: (invitation) => <StatusBadge status={invitation.role} dot={false} />,
    },
    {
      key: 'invitedBy',
      header: 'Invited by',
      width: 'minmax(130px, 0.9fr)',
      hideBelow: 'lg',
      render: (invitation) => (
        <span className="truncate text-muted-foreground">{invitation.invitedBy?.name ?? '—'}</span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'expiresAt',
      hideBelow: 'md',
      render: (invitation) => (
        <span className="text-xs text-muted-foreground">{formatDate(invitation.expiresAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'status',
      render: (invitation) => <StatusBadge status={invitation.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search invitations…"
        total={query.total}
        loadedCount={query.items.length}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'], 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(invitation) => invitation.id}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={query.fetchNextPage}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSortChange={list.setSort}
        emptyIcon={<Mail />}
        emptyTitle="No invitations yet"
        emptyDescription="Invitations you send will be tracked here until they are accepted."
        mobileRow={(invitation) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{invitation.name}</span>
              <StatusBadge status={invitation.status} size="sm" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {invitation.role} · {invitation.email ?? invitation.mobile}
            </p>
          </div>
        )}
        rowActions={(invitation) => (
          <RowActions
            actions={[
              {
                label: 'Resend & copy link',
                icon: <RotateCcw />,
                hidden: invitation.status === 'ACCEPTED',
                onSelect: () => resend.mutate(invitation.id),
              },
              {
                label: 'Revoke invitation',
                icon: <Ban />,
                variant: 'destructive',
                separatorBefore: true,
                hidden: invitation.status !== 'PENDING',
                onSelect: () => setRevoking(invitation),
              },
            ]}
          />
        )}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke the invitation for ${revoking?.name}?`}
        description="The link stops working immediately and the pending account is suspended."
        confirmLabel="Revoke invitation"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}


