'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, IdCard, Manager, Phone, Steering, Truck as TruckIcon, UserPlus, UserRound } from '@/components/icons';
import { formatDate, formatNumber } from '@/lib/format';
import type { Truck, UserRecord } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useListState } from '@/hooks/use-list-state';
import { DataList, type Column } from '@/components/data/data-list';
import { ListToolbar, PageHeader, optionsFrom } from '@/components/data/list-toolbar';
import { RowActions } from '@/components/data/row-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { InviteUserDialog } from '../users/invite-dialog';
import { ExpiryCell } from '@/components/data/expiry-cell';
import { FleetByManager } from '../managers/fleet-by-manager';

interface DriverRow extends UserRecord {
  assignedTruck: Truck | null;
  tripCount: number;
  activeTripCount: number;
}

export default function DriversPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  // A manager onboards onto their own roster, so they get the button too.
  const canInvite = isAdmin || user?.role === 'MANAGER';

  const list = useListState({ defaultSort: 'createdAt', filterKeys: ['status', 'availability'] });
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const query = useInfiniteList<DriverRow>({ path: '/drivers', params: list.params });

  const columns: Column<DriverRow>[] = [
    {
      key: 'driver',
      header: 'Driver',
      width: 'minmax(210px, 1.7fr)',
      sortKey: 'name',
      render: (driver) => (
        <div className="flex items-center gap-3">
          <Avatar name={driver.name} color={driver.avatarColor} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{driver.name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Phone className="size-3 shrink-0" />
              <span className="tabular">{driver.mobile ?? driver.email ?? '—'}</span>
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'truck',
      header: 'Assigned truck',
      width: 'minmax(150px, 1.1fr)',
      hideBelow: 'md',
      render: (driver) =>
        driver.assignedTruck ? (
          <div className="flex items-center gap-2">
            <TruckIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate tabular">{driver.assignedTruck.truckNumber}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">No truck</span>
        ),
    },
    {
      key: 'licence',
      header: 'Licence',
      width: 'minmax(150px, 1.1fr)',
      hideBelow: 'xl',
      render: (driver) => (
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 truncate text-xs">
            <IdCard className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate tabular">{driver.licenseNumber ?? '—'}</span>
          </p>
          <ExpiryCell date={driver.licenseExpiry} />
        </div>
      ),
    },
    {
      key: 'trips',
      header: 'Trips',
      width: 'minmax(110px, 0.7fr)',
      align: 'right',
      hideBelow: 'lg',
      render: (driver) => (
        <div className="text-xs">
          <p className="tabular font-medium">{formatNumber(driver.tripCount)} total</p>
          {driver.activeTripCount > 0 ? (
            <Badge variant="default" size="sm">
              {driver.activeTripCount} active
            </Badge>
          ) : (
            <span className="text-muted-foreground">available</span>
          )}
        </div>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'manager',
            header: 'Works under',
            width: 'minmax(140px, 1fr)',
            hideBelow: 'lg',
            render: (driver: DriverRow) =>
              driver.manager ? (
                <div className="flex items-center gap-2">
                  <Avatar name={driver.manager.name} color={driver.manager.avatarColor} size="xs" />
                  <span className="truncate text-sm">{driver.manager.name}</span>
                </div>
              ) : (
                <Badge variant="danger" size="sm">
                  No manager
                </Badge>
              ),
          } as Column<DriverRow>,
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(110px, 0.7fr)',
      sortKey: 'status',
      render: (driver) => <StatusBadge status={driver.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Drivers"
        description="Your driver roster, the truck each one holds and how busy they are."
        actions={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite driver
            </Button>
          ) : null
        }
      />

      {isAdmin ? (
        <Tabs defaultValue="roster" className="space-y-4">
          <TabsList>
            <TabsTrigger value="roster">
              <Steering />
              Roster
            </TabsTrigger>
            <TabsTrigger value="by-manager">
              <Manager />
              By manager
            </TabsTrigger>
          </TabsList>

          <TabsContent value="by-manager">
            <FleetByManager defaultTab="drivers" />
          </TabsContent>

          <TabsContent value="roster" className="space-y-5">
            <Roster />
          </TabsContent>
        </Tabs>
      ) : (
        <Roster />
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} defaultRole="DRIVER" />
    </div>
  );

  /**
   * The roster itself. Declared inside so it keeps the page's list state and
   * query rather than re-fetching behind the tab it sits in.
   */
  function Roster() {
    return (
      <>
      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by name, mobile or licence…"
        total={query.total}
        loadedCount={query.items.length}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'ALL',
            options: optionsFrom(['ACTIVE', 'INVITED', 'SUSPENDED'], 'All statuses'),
            onChange: (value) => list.setFilter('status', value),
            primary: true,
          },
          {
            key: 'availability',
            label: 'Availability',
            value: list.filters.availability ?? 'ALL',
            options: [
              { label: 'Everyone', value: 'ALL' },
              { label: 'On a trip', value: 'ON_TRIP' },
              { label: 'Available', value: 'AVAILABLE' },
            ],
            onChange: (value) => list.setFilter('availability', value),
            primary: true,
          },
        ]}
      />

      <DataList
        items={query.items}
        columns={columns}
        getRowId={(driver) => driver.id}
        isLoading={query.isLoading}
        isRefetching={query.isRefetching}
        isError={query.isError}
        error={query.error}
        onRetry={() => query.refetch()}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={query.fetchNextPage}
        sortBy={list.sortBy}
        sortDir={list.sortDir}
        onSortChange={list.setSort}
        onRowClick={(driver) => router.push(`/drivers/${driver.id}`)}
        emptyIcon={<UserRound />}
        emptyTitle="No drivers yet"
        emptyDescription="Invite a driver to start assigning trucks and trips."
        emptyAction={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite driver
            </Button>
          ) : undefined
        }
        mobileRow={(driver) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Avatar name={driver.name} color={driver.avatarColor} size="xs" />
              <span className="font-medium">{driver.name}</span>
              <StatusBadge status={driver.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              {driver.mobile} · {driver.assignedTruck?.truckNumber ?? 'No truck'}
            </p>
            <p className="text-xs text-muted-foreground">
              {driver.tripCount} trips · joined {formatDate(driver.createdAt, 'MMM yyyy')}
            </p>
          </div>
        )}
        rowActions={(driver) => (
          <RowActions
            actions={[
              { label: 'View profile', icon: <Eye />, onSelect: () => router.push(`/drivers/${driver.id}`) },
            ]}
          />
        )}
      />

      </>
    );
  }
}
