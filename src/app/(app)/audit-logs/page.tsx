'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { humanise } from '@/lib/utils';
import type { AuditLogEntry } from '@/lib/types';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader } from '@/components/data/list-toolbar';
import { Badge } from '@/components/ui/badge';
import { Avatar, Tooltip } from '@/components/ui/misc';

export default function AuditLogsPage() {
  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['entity', 'action'] });

  const query = useInfiniteList<AuditLogEntry>({ path: '/audit-logs', params: list.params });

  const { data: facets } = useQuery({
    queryKey: ['audit-facets'],
    queryFn: () => api.get<{ entities: string[]; actions: string[] }>('/audit-logs/facets'),
    staleTime: 5 * 60_000,
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'event',
      header: 'Event',
      width: 'minmax(320px, 2.4fr)',
      render: (entry) => (
        <div className="flex items-start gap-3">
          <Avatar name={entry.user?.name ?? entry.userName} color={entry.user?.avatarColor} size="xs" />
          <div className="min-w-0">
            <p className="text-[13px] leading-snug">{entry.summary}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {entry.userName}
              {entry.userRole ? ` · ${humanise(entry.userRole)}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: 'minmax(170px, 1.1fr)',
      hideBelow: 'lg',
      render: (entry) => (
        <Badge variant="neutral" size="sm" className="font-mono">
          {entry.action}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      width: 'minmax(110px, 0.7fr)',
      hideBelow: 'xl',
      render: (entry) => <span className="text-muted-foreground">{entry.entity}</span>,
    },
    {
      key: 'when',
      header: 'When',
      width: 'minmax(140px, 0.9fr)',
      sortKey: 'createdAt',
      align: 'right',
      render: (entry) => (
        <Tooltip label={formatDateTime(entry.createdAt)}>
          <span className="cursor-help text-xs text-muted-foreground">{formatRelative(entry.createdAt)}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Every meaningful action taken in the system, with who did it and when."
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search the audit trail…"
        total={query.total}
        loadedCount={query.items.length}
        dateRange={{ ...list.dateRange, onChange: list.setDateRange }}
        filters={[
          {
            key: 'entity',
            label: 'Entity',
            value: list.filters.entity ?? 'ALL',
            options: [
              { label: 'All entities', value: 'ALL' },
              ...(facets?.entities ?? []).map((entity) => ({ label: entity, value: entity })),
            ],
            onChange: (value) => list.setFilter('entity', value),
            primary: true,
          },
          {
            key: 'action',
            label: 'Action',
            value: list.filters.action ?? 'ALL',
            options: [
              { label: 'All actions', value: 'ALL' },
              ...(facets?.actions ?? []).map((action) => ({ label: humanise(action), value: action })),
            ],
            onChange: (value) => list.setFilter('action', value),
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(entry) => entry.id}
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
        emptyIcon={<ScrollText />}
        emptyTitle="Nothing logged yet"
        emptyDescription="Invitations, trip changes and expense decisions all appear here."
        // The audit trail is the longest list in the system, so it virtualises.
        virtualHeight={680}
        mobileRow={(entry) => (
          <div className="space-y-1">
            <p className="text-[13px] leading-snug">{entry.summary}</p>
            <p className="text-xs text-muted-foreground">
              {entry.userName} · {formatRelative(entry.createdAt)}
            </p>
          </div>
        )}
      />
    </div>
  );
}
