'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  Mail,
  Search,
  Smartphone,
  Steering,
  Truck as TruckIcon,
} from '@/components/icons';
import { api } from '@/lib/api';
import { cn, humanise } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import type { ManagerFleetGroup, ManagerFleetReport, ManagerFleetTruck } from '@/lib/types';
import { Avatar } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatusBadge, statusVariant } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The administrator's manager-by-manager view of the fleet.
 *
 * Deliberately a full listing rather than a count: "nine trucks" tells an
 * administrator nothing they can act on, whereas the nine registration numbers,
 * their statuses and their drivers do. Counts are still shown, in the group
 * header, so the question "who holds the most?" is answerable at a glance.
 */
export function FleetByManager() {
  const [search, setSearch] = React.useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/trucks/by-manager'],
    queryFn: () => api.get<ManagerFleetReport>('/trucks/by-manager'),
  });

  const term = search.trim().toLowerCase();

  /**
   * Searching narrows the trucks inside each group and then drops the groups
   * left holding nothing — except when the manager's own name matched, where
   * their whole fleet stays visible.
   */
  const groups = React.useMemo(() => {
    if (!data) return [];
    if (!term) return data.groups;

    return data.groups
      .map((group) => {
        if (group.manager.name.toLowerCase().includes(term)) return group;
        const trucks = group.trucks.filter((truck) => matches(truck, term));
        return { ...group, trucks, truckCount: trucks.length };
      })
      .filter((group) => group.trucks.length > 0);
  }, [data, term]);

  const unassigned = React.useMemo(() => {
    if (!data) return [];
    return term ? data.unassigned.filter((truck) => matches(truck, term)) : data.unassigned;
  }, [data, term]);

  if (isError) {
    return (
      <div className="surface-card">
        <ErrorState
          title="Could not load the fleet"
          description={(error as Error)?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const { totals } = data;
  const nothingMatched = groups.length === 0 && unassigned.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a truck number, make or manager…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{formatNumber(totals.managers)} managers</Badge>
          <Badge variant="outline">{formatNumber(totals.trucks)} trucks</Badge>
          <Badge variant="success">{formatNumber(totals.assigned)} assigned</Badge>
          {totals.unassigned > 0 ? (
            <Badge variant="danger">{formatNumber(totals.unassigned)} unassigned</Badge>
          ) : null}
        </div>
      </div>

      {nothingMatched ? (
        <div className="surface-card">
          <EmptyState
            title="Nothing matched that search"
            description="Try a truck number, a registration, a make or a manager's name."
          />
        </div>
      ) : null}

      {unassigned.length > 0 ? <UnassignedGroup trucks={unassigned} /> : null}

      {groups.map((group) => (
        <ManagerGroup key={group.manager.id} group={group} defaultOpen={group.truckCount > 0} />
      ))}
    </div>
  );
}

function matches(truck: ManagerFleetTruck, term: string): boolean {
  return [truck.truckNumber, truck.registrationNumber, truck.make, truck.model, truck.assignedDriver?.name]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(term));
}

function ManagerGroup({ group, defaultOpen }: { group: ManagerFleetGroup; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const { manager } = group;

  return (
    <section className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={group.truckCount === 0}
        className={cn(
          'focus-ring flex w-full items-center gap-3 p-4 text-left transition-colors',
          group.truckCount > 0 && 'hover:bg-muted/40',
          group.truckCount === 0 && 'cursor-default',
        )}
      >
        <Avatar name={manager.name} color={manager.avatarColor} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{manager.name}</span>
            {manager.status !== 'ACTIVE' ? <StatusBadge status={manager.status} size="sm" /> : null}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {manager.email ? (
              <span className="flex items-center gap-1 truncate">
                <Mail className="size-3 shrink-0" />
                {manager.email}
              </span>
            ) : null}
            {manager.mobile ? (
              <span className="flex items-center gap-1">
                <Smartphone className="size-3 shrink-0" />
                <span className="tabular">{manager.mobile}</span>
              </span>
            ) : null}
            {group.sharedInCount > 0 ? (
              <span>
                + {formatNumber(group.sharedInCount)} shared with them
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden flex-wrap items-center justify-end gap-1.5 md:flex">
            {Object.entries(group.byStatus).map(([status, count]) => (
              <Badge key={status} variant={statusVariant(status)} size="sm" dot>
                {humanise(status)} {count}
              </Badge>
            ))}
          </div>

          <Badge variant={group.truckCount > 0 ? 'default' : 'neutral'} className="gap-1">
            <TruckIcon />
            {formatNumber(group.truckCount)}
          </Badge>

          {group.truckCount > 0 ? (
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          ) : null}
        </div>
      </button>

      {group.truckCount === 0 ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          This manager holds no trucks yet. Assign one from the truck&apos;s own page.
        </p>
      ) : open ? (
        <TruckTable trucks={group.trucks} />
      ) : null}
    </section>
  );
}

function UnassignedGroup({ trucks }: { trucks: ManagerFleetTruck[] }) {
  const [open, setOpen] = React.useState(true);

  return (
    <section className="surface-card overflow-hidden border-destructive/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-destructive-soft/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive-soft text-destructive [&_svg]:size-5">
          <AlertTriangle />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-destructive">No manager assigned</p>
          <p className="text-xs text-muted-foreground">
            Nobody holds these trucks, so no manager can see or use them. Open each one and set an owner.
          </p>
        </div>

        <Badge variant="danger" className="shrink-0 gap-1">
          <TruckIcon />
          {formatNumber(trucks.length)}
        </Badge>

        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? <TruckTable trucks={trucks} /> : null}
    </section>
  );
}

function TruckTable({ trucks }: { trucks: ManagerFleetTruck[] }) {
  return (
    <div className="border-t">
      {/* Desktop: a real grid, so columns line up across every group. */}
      <div className="hidden grid-cols-[minmax(150px,1.3fr)_minmax(140px,1.2fr)_minmax(100px,0.7fr)_minmax(140px,1fr)_minmax(110px,0.8fr)] gap-3 border-b bg-muted/30 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
        <span>Truck</span>
        <span>Make &amp; model</span>
        <span>Capacity</span>
        <span>Driver</span>
        <span>Status</span>
      </div>

      <ul className="divide-y">
        {trucks.map((truck) => (
          <li key={truck.id}>
            <Link
              href={`/trucks/${truck.id}`}
              className="focus-ring block px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(150px,1.3fr)_minmax(140px,1.2fr)_minmax(100px,0.7fr)_minmax(140px,1fr)_minmax(110px,0.8fr)] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium tabular">{truck.truckNumber}</p>
                  <p className="truncate text-xs text-muted-foreground tabular">{truck.registrationNumber}</p>
                </div>

                <div className="min-w-0 text-sm">
                  <p className="truncate">
                    {truck.make} {truck.model}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">{truck.year}</p>
                </div>

                <p className="text-sm tabular text-muted-foreground">{truck.capacityTons} t</p>

                <div className="min-w-0">
                  {truck.assignedDriver ? (
                    <span className="flex items-center gap-2">
                      <Avatar
                        name={truck.assignedDriver.name}
                        color={truck.assignedDriver.avatarColor}
                        size="xs"
                      />
                      <span className="truncate text-sm">{truck.assignedDriver.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Steering className="size-3.5" />
                      No driver
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={truck.status} size="sm" />
                  {truck.shareCount > 0 ? (
                    <Badge variant="neutral" size="sm">
                      shared ×{truck.shareCount}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
