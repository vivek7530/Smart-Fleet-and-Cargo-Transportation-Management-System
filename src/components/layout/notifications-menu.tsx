'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  FileText,
  IndianRupee,
  Route,
  UserPlus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import type { AppNotification, Page } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';
import { EmptyState } from '@/components/ui/empty-state';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TRIP_ASSIGNED: Route,
  TRIP_STARTED: Route,
  TRIP_COMPLETED: Route,
  TRIP_CANCELLED: Route,
  EXPENSE_SUBMITTED: IndianRupee,
  EXPENSE_APPROVED: IndianRupee,
  EXPENSE_REJECTED: IndianRupee,
  BREAKDOWN_REPORTED: AlertTriangle,
  BREAKDOWN_UPDATED: AlertTriangle,
  DOCUMENT_EXPIRING: FileText,
  DOCUMENT_VERIFIED: FileText,
  INVITATION_SENT: UserPlus,
  INVITATION_ACCEPTED: UserPlus,
  MAINTENANCE_DUE: AlertTriangle,
};

const TONES: Record<string, string> = {
  EXPENSE_APPROVED: 'bg-success-soft text-success',
  EXPENSE_REJECTED: 'bg-destructive-soft text-destructive',
  BREAKDOWN_REPORTED: 'bg-destructive-soft text-destructive',
  BREAKDOWN_UPDATED: 'bg-warning-soft text-warning',
  DOCUMENT_EXPIRING: 'bg-warning-soft text-warning',
  TRIP_COMPLETED: 'bg-success-soft text-success',
  TRIP_CANCELLED: 'bg-destructive-soft text-destructive',
};

export function NotificationsMenu() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    // A light poll keeps the badge fresh without a websocket.
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<Page<AppNotification> & { unreadCount: number }>('/notifications', { limit: 12 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = unread?.count ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground tabular">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[22rem] p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Notifications</h3>
            {unreadCount > 0 ? (
              <Badge variant="default" size="sm">
                {unreadCount} new
              </Badge>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-3 p-2">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              icon={<BellOff />}
              title="You're all caught up"
              description="New trips, expenses and alerts will show up here."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {items.map((notification) => {
                const Icon = ICONS[notification.type] ?? Bell;
                const body = (
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                        TONES[notification.type] ?? 'bg-primary-soft text-primary',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-[13px] leading-snug',
                          notification.read ? 'font-medium text-muted-foreground' : 'font-semibold',
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-2xs text-muted-foreground/80">
                        {formatRelative(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.read ? (
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    ) : null}
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          if (!notification.read) markRead.mutate(notification.id);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !notification.read && markRead.mutate(notification.id)}
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
