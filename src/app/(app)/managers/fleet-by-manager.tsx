'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  IdCard,
  Mail,
  Phone,
  Smartphone,
  Steering,
  Truck as TruckIcon,
} from '@/components/icons';
import { api } from '@/lib/api';
import { cn, humanise } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import type {
  ManagerFleetDriver,
  ManagerFleetGroup,
  ManagerFleetReport,
  ManagerFleetTruck,
} from '@/lib/types';
import { ListToolbar, optionsFrom, type FilterConfig } from '@/components/data/list-toolbar';
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge, statusVariant } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryCell } from '@/components/data/expiry-cell';

const TRUCK_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_TRIP', 'MAINTENANCE', 'INACTIVE'];
const DRIVER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED'];

type SortKey = 'MOST' | 'FEWEST' | 'NAME';

const SORT_OPTIONS = [
  { label: 'Most first', value: 'MOST' },
  { label: 'Fewest first', value: 'FEWEST' },
  { label: 'Name A–Z', value: 'NAME' },
];

/**
 * The administrator's manager-by-manager view of the fleet and the roster.
 *
 * Deliberately full listings rather than counts: "nine trucks" tells an
 * administrator nothing they can act on, whereas the nine registration numbers
 * and their drivers do. The counts stay in each group header, so "who holds the
 * most?" is still answerable at a glance.
 *
 * Both tabs run off one request. A fleet and a staff list are small enough to
 * arrive whole, and filtering in the browser means the totals can never
 * disagree with the rows underneath them the way a re-paginated view can.
 */
export function FleetByManager({ defaultTab = 'trucks' }: { defaultTab?: 'trucks' | 'drivers' }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/trucks/by-manager'],
    queryFn: () => api.get<ManagerFleetReport>('/trucks/by-manager'),
  });

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
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="trucks">
          <TruckIcon />
          Trucks ({formatNumber(data.totals.trucks)})
        </TabsTrigger>
        <TabsTrigger value="drivers">
          <Steering />
          Drivers ({formatNumber(data.totals.drivers)})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="trucks">
        <TrucksByManager report={data} />
      </TabsContent>

      <TabsContent value="drivers">
        <DriversByManager report={data} />
      </TabsContent>
    </Tabs>
  );
}

/* -------------------------------------------------------------------------- *
 * Shared machinery
 * -------------------------------------------------------------------------- */

/**
 * Which groups are open.
 *
 * `collapsed` holds only the groups the user has touched; `allCollapsed` is the
 * base the untouched ones fall back to. That is what makes "Collapse all" one
 * state change rather than an entry written for every group on screen.
 */
function useCollapse() {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = React.useState(false);

  const isOpen = React.useCallback(
    (id: string) => !(collapsed[id] ?? allCollapsed),
    [collapsed, allCollapsed],
  );

  return {
    allCollapsed,
    isOpen,
    toggle: (id: string) => setCollapsed((prev) => ({ ...prev, [id]: isOpen(id) })),
    setAll: (next: boolean) => {
      setAllCollapsed(next);
      setCollapsed({});
    },
  };
}

function sortGroups(groups: ManagerFleetGroup[], sort: SortKey, count: (g: ManagerFleetGroup) => number) {
  return [...groups].sort((a, b) => {
    if (sort === 'NAME') return a.manager.name.localeCompare(b.manager.name);
    const delta = sort === 'FEWEST' ? count(a) - count(b) : count(b) - count(a);
    return delta || a.manager.name.localeCompare(b.manager.name);
  });
}

/** The collapsible card every group is drawn in, whatever it holds. */
function GroupCard({
  lead,
  title,
  subtitle,
  chips,
  count,
  countTone = 'default',
  open,
  onToggle,
  emptyText,
  tone,
  children,
}: {
  lead: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  count: number;
  countTone?: 'default' | 'neutral' | 'danger';
  open: boolean;
  onToggle: () => void;
  emptyText?: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  const empty = count === 0;

  return (
    <section className={cn('surface-card overflow-hidden', tone === 'danger' && 'border-destructive/30')}>
      <button
        type="button"
        onClick={onToggle}
        disabled={empty}
        className={cn(
          'focus-ring flex w-full items-center gap-3 p-4 text-left transition-colors',
          !empty && (tone === 'danger' ? 'hover:bg-destructive-soft/40' : 'hover:bg-muted/40'),
          empty && 'cursor-default',
        )}
      >
        {lead}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">{title}</div>
          {subtitle ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {chips ? <div className="hidden flex-wrap items-center justify-end gap-1.5 md:flex">{chips}</div> : null}

          <Badge variant={empty ? 'neutral' : countTone} className="gap-1">
            {formatNumber(count)}
          </Badge>

          {!empty ? (
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          ) : null}
        </div>
      </button>

      {empty ? (
        emptyText ? (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">{emptyText}</p>
        ) : null
      ) : open ? (
        children
      ) : null}
    </section>
  );
}

/** The manager's identity, shared by both tabs' group headers. */
function managerLead(group: ManagerFleetGroup) {
  return <Avatar name={group.manager.name} color={group.manager.avatarColor} size="sm" />;
}

function managerTitle(group: ManagerFleetGroup) {
  return (
    <>
      <span className="truncate font-medium">{group.manager.name}</span>
      {group.manager.status !== 'ACTIVE' ? <StatusBadge status={group.manager.status} size="sm" /> : null}
    </>
  );
}

function managerSubtitle(group: ManagerFleetGroup, extra?: React.ReactNode) {
  const { manager } = group;
  return (
    <>
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
      {extra}
    </>
  );
}

function statusChips(byStatus: Record<string, number | undefined>) {
  return Object.entries(byStatus).map(([status, count]) => (
    <Badge key={status} variant={statusVariant(status)} size="sm" dot>
      {humanise(status)} {count}
    </Badge>
  ));
}

const DANGER_LEAD = (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive-soft text-destructive [&_svg]:size-5">
    <AlertTriangle />
  </span>
);

/* -------------------------------------------------------------------------- *
 * Trucks
 * -------------------------------------------------------------------------- */

function TrucksByManager({ report }: { report: ManagerFleetReport }) {
  const [search, setSearch] = React.useState('');
  const [managerId, setManagerId] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');
  const [driverState, setDriverState] = React.useState('ALL');
  const [holding, setHolding] = React.useState('ALL');
  const [sort, setSort] = React.useState<SortKey>('MOST');
  const collapse = useCollapse();

  const term = search.trim().toLowerCase();
  const rowFilterActive = Boolean(term) || status !== 'ALL' || driverState !== 'ALL';

  const keep = React.useCallback(
    (truck: ManagerFleetTruck) => {
      if (status !== 'ALL' && truck.status !== status) return false;
      if (driverState === 'ASSIGNED' && !truck.assignedDriver) return false;
      if (driverState === 'UNASSIGNED' && truck.assignedDriver) return false;
      if (!term) return true;
      return [truck.truckNumber, truck.registrationNumber, truck.make, truck.model, truck.assignedDriver?.name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    },
    [status, driverState, term],
  );

  const groups = React.useMemo(() => {
    if (holding === 'UNOWNED') return [];

    let list = report.groups;
    if (managerId !== 'ALL') list = list.filter((group) => group.manager.id === managerId);

    const narrowed = list.map((group) => {
      const trucks = group.trucks.filter(keep);
      if (trucks.length === group.trucks.length) return group;
      const byStatus: Record<string, number> = {};
      for (const truck of trucks) byStatus[truck.status] = (byStatus[truck.status] ?? 0) + 1;
      return { ...group, trucks, truckCount: trucks.length, byStatus };
    });

    // A manager picked by name stays on screen even holding nothing — "none" is
    // the answer the administrator was looking for.
    const visible =
      managerId !== 'ALL'
        ? narrowed
        : rowFilterActive
          ? narrowed.filter((group) => group.trucks.length > 0)
          : holding === 'HOLDING'
            ? narrowed.filter((group) => group.truckCount > 0)
            : holding === 'EMPTY'
              ? narrowed.filter((group) => group.truckCount === 0)
              : narrowed;

    return sortGroups(visible, sort, (group) => group.truckCount);
  }, [report.groups, managerId, holding, rowFilterActive, keep, sort]);

  const unowned = React.useMemo(() => {
    // An unowned truck belongs to no manager, so narrowing by manager hides it.
    if (managerId !== 'ALL' || holding === 'HOLDING' || holding === 'EMPTY') return [];
    return report.unassigned.filter(keep);
  }, [report.unassigned, managerId, holding, keep]);

  const shown = groups.reduce((sum, group) => sum + group.trucks.length, 0) + unowned.length;

  const filters: FilterConfig[] = [
    {
      key: 'manager',
      label: 'Manager',
      value: managerId,
      options: [
        { label: 'All managers', value: 'ALL' },
        ...report.groups.map((group) => ({
          label: `${group.manager.name} (${group.truckCount})`,
          value: group.manager.id,
        })),
      ],
      onChange: setManagerId,
      primary: true,
    },
    {
      key: 'status',
      label: 'Status',
      value: status,
      options: optionsFrom(TRUCK_STATUSES, 'All statuses'),
      onChange: setStatus,
      primary: true,
    },
    {
      key: 'driver',
      label: 'Driver',
      value: driverState,
      options: [
        { label: 'Any driver', value: 'ALL' },
        { label: 'Has a driver', value: 'ASSIGNED' },
        { label: 'No driver', value: 'UNASSIGNED' },
      ],
      onChange: setDriverState,
    },
    {
      key: 'holding',
      label: 'Holding',
      value: holding,
      options: [
        { label: 'Everyone', value: 'ALL' },
        { label: 'Holds at least one', value: 'HOLDING' },
        { label: 'Holds nothing', value: 'EMPTY' },
        { label: 'Unowned trucks only', value: 'UNOWNED' },
      ],
      onChange: setHolding,
    },
    {
      key: 'sort',
      label: 'Sort',
      value: sort,
      options: SORT_OPTIONS,
      onChange: (value) => setSort(value === 'ALL' ? 'MOST' : (value as SortKey)),
    },
  ];

  return (
    <div className="space-y-5">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search a truck number, registration, make or driver…"
        filters={filters}
        total={report.totals.trucks}
        loadedCount={shown}
        actions={
          <Button variant="outline" onClick={() => collapse.setAll(!collapse.allCollapsed)} className="gap-2">
            <ChevronsUpDown />
            {collapse.allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{formatNumber(report.totals.managers)} managers</Badge>
        <Badge variant="outline">{formatNumber(report.totals.trucks)} trucks</Badge>
        <Badge variant="success">{formatNumber(report.totals.assigned)} under a manager</Badge>
        {report.totals.unassigned > 0 ? (
          <Badge variant="danger">{formatNumber(report.totals.unassigned)} with nobody</Badge>
        ) : null}
      </div>

      {groups.length === 0 && unowned.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={<TruckIcon />}
            title="Nothing matched"
            description="Try a different truck number, registration, make, driver or manager — or clear the filters."
          />
        </div>
      ) : null}

      {unowned.length > 0 ? (
        <GroupCard
          lead={DANGER_LEAD}
          tone="danger"
          countTone="danger"
          count={unowned.length}
          open={collapse.isOpen('__unowned__')}
          onToggle={() => collapse.toggle('__unowned__')}
          title={<span className="font-medium text-destructive">No manager assigned</span>}
          subtitle="Nobody holds these trucks, so no manager can see or use them. Open each one and set an owner."
        >
          <TruckTable trucks={unowned} />
        </GroupCard>
      ) : null}

      {groups.map((group) => (
        <GroupCard
          key={group.manager.id}
          lead={managerLead(group)}
          title={managerTitle(group)}
          subtitle={managerSubtitle(
            group,
            group.sharedInCount > 0 ? <span>+ {formatNumber(group.sharedInCount)} shared with them</span> : null,
          )}
          chips={statusChips(group.byStatus)}
          count={group.truckCount}
          open={collapse.isOpen(group.manager.id)}
          onToggle={() => collapse.toggle(group.manager.id)}
          emptyText="This manager holds no trucks. Open a truck and set them as its owner."
        >
          <TruckTable trucks={group.trucks} />
        </GroupCard>
      ))}
    </div>
  );
}

/**
 * The column template is written out literally because Tailwind only sees class
 * names that appear in the source — one built at runtime compiles to nothing.
 */
const TRUCK_COLUMNS =
  'lg:grid-cols-[minmax(150px,1.3fr)_minmax(140px,1.2fr)_minmax(100px,0.7fr)_minmax(140px,1fr)_minmax(110px,0.8fr)]';

function TruckTable({ trucks }: { trucks: ManagerFleetTruck[] }) {
  return (
    <div className="border-t">
      <TableHead columns={TRUCK_COLUMNS} labels={['Truck', 'Make & model', 'Capacity', 'Driver', 'Status']} />

      <ul className="divide-y">
        {trucks.map((truck) => (
          <li key={truck.id}>
            <Link
              href={`/trucks/${truck.id}`}
              className="focus-ring block px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className={cn('grid gap-3 lg:items-center', TRUCK_COLUMNS)}>
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

/* -------------------------------------------------------------------------- *
 * Drivers
 * -------------------------------------------------------------------------- */

function DriversByManager({ report }: { report: ManagerFleetReport }) {
  const [search, setSearch] = React.useState('');
  const [managerId, setManagerId] = React.useState('ALL');
  const [status, setStatus] = React.useState('ALL');
  const [truckState, setTruckState] = React.useState('ALL');
  const [availability, setAvailability] = React.useState('ALL');
  const [roster, setRoster] = React.useState('ALL');
  const [sort, setSort] = React.useState<SortKey>('MOST');
  const collapse = useCollapse();

  const term = search.trim().toLowerCase();
  const rowFilterActive =
    Boolean(term) || status !== 'ALL' || truckState !== 'ALL' || availability !== 'ALL';

  const keep = React.useCallback(
    (driver: ManagerFleetDriver) => {
      if (status !== 'ALL' && driver.status !== status) return false;
      if (truckState === 'ASSIGNED' && !driver.assignedTruck) return false;
      if (truckState === 'UNASSIGNED' && driver.assignedTruck) return false;
      if (availability === 'ON_TRIP' && driver.activeTripCount === 0) return false;
      if (availability === 'FREE' && driver.activeTripCount > 0) return false;
      if (!term) return true;
      return [driver.name, driver.mobile, driver.email, driver.licenseNumber, driver.assignedTruck?.truckNumber]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    },
    [status, truckState, availability, term],
  );

  const groups = React.useMemo(() => {
    if (roster === 'UNMANAGED') return [];

    let list = report.groups;
    if (managerId !== 'ALL') list = list.filter((group) => group.manager.id === managerId);

    const narrowed = list.map((group) => {
      const drivers = group.drivers.filter(keep);
      if (drivers.length === group.drivers.length) return group;
      const driversByStatus: Record<string, number> = {};
      for (const driver of drivers) {
        driversByStatus[driver.status] = (driversByStatus[driver.status] ?? 0) + 1;
      }
      return { ...group, drivers, driverCount: drivers.length, driversByStatus };
    });

    const visible =
      managerId !== 'ALL'
        ? narrowed
        : rowFilterActive
          ? narrowed.filter((group) => group.drivers.length > 0)
          : roster === 'HOLDING'
            ? narrowed.filter((group) => group.driverCount > 0)
            : roster === 'EMPTY'
              ? narrowed.filter((group) => group.driverCount === 0)
              : narrowed;

    return sortGroups(visible, sort, (group) => group.driverCount);
  }, [report.groups, managerId, roster, rowFilterActive, keep, sort]);

  const unmanaged = React.useMemo(() => {
    if (managerId !== 'ALL' || roster === 'HOLDING' || roster === 'EMPTY') return [];
    return report.unassignedDrivers.filter(keep);
  }, [report.unassignedDrivers, managerId, roster, keep]);

  const shown = groups.reduce((sum, group) => sum + group.drivers.length, 0) + unmanaged.length;

  const filters: FilterConfig[] = [
    {
      key: 'manager',
      label: 'Manager',
      value: managerId,
      options: [
        { label: 'All managers', value: 'ALL' },
        ...report.groups.map((group) => ({
          label: `${group.manager.name} (${group.driverCount})`,
          value: group.manager.id,
        })),
      ],
      onChange: setManagerId,
      primary: true,
    },
    {
      key: 'status',
      label: 'Status',
      value: status,
      options: optionsFrom(DRIVER_STATUSES, 'All statuses'),
      onChange: setStatus,
      primary: true,
    },
    {
      key: 'truck',
      label: 'Truck',
      value: truckState,
      options: [
        { label: 'Any truck', value: 'ALL' },
        { label: 'Has a truck', value: 'ASSIGNED' },
        { label: 'No truck', value: 'UNASSIGNED' },
      ],
      onChange: setTruckState,
    },
    {
      key: 'availability',
      label: 'Availability',
      value: availability,
      options: [
        { label: 'Everyone', value: 'ALL' },
        { label: 'On a trip', value: 'ON_TRIP' },
        { label: 'Free now', value: 'FREE' },
      ],
      onChange: setAvailability,
    },
    {
      key: 'roster',
      label: 'Roster',
      value: roster,
      options: [
        { label: 'Everyone', value: 'ALL' },
        { label: 'Has at least one', value: 'HOLDING' },
        { label: 'Has nobody', value: 'EMPTY' },
        { label: 'Unmanaged drivers only', value: 'UNMANAGED' },
      ],
      onChange: setRoster,
    },
    {
      key: 'sort',
      label: 'Sort',
      value: sort,
      options: SORT_OPTIONS,
      onChange: (value) => setSort(value === 'ALL' ? 'MOST' : (value as SortKey)),
    },
  ];

  return (
    <div className="space-y-5">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search a driver, mobile, licence or truck…"
        filters={filters}
        total={report.totals.drivers}
        loadedCount={shown}
        actions={
          <Button variant="outline" onClick={() => collapse.setAll(!collapse.allCollapsed)} className="gap-2">
            <ChevronsUpDown />
            {collapse.allCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{formatNumber(report.totals.managers)} managers</Badge>
        <Badge variant="outline">{formatNumber(report.totals.drivers)} drivers</Badge>
        <Badge variant="success">{formatNumber(report.totals.assignedDrivers)} on a roster</Badge>
        {report.totals.unassignedDrivers > 0 ? (
          <Badge variant="danger">{formatNumber(report.totals.unassignedDrivers)} with nobody</Badge>
        ) : null}
      </div>

      {groups.length === 0 && unmanaged.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon={<Steering />}
            title="Nothing matched"
            description="Try a different name, mobile, licence, truck or manager — or clear the filters."
          />
        </div>
      ) : null}

      {unmanaged.length > 0 ? (
        <GroupCard
          lead={DANGER_LEAD}
          tone="danger"
          countTone="danger"
          count={unmanaged.length}
          open={collapse.isOpen('__unmanaged__')}
          onToggle={() => collapse.toggle('__unmanaged__')}
          title={<span className="font-medium text-destructive">No manager assigned</span>}
          subtitle="Nobody manages these drivers, so no manager can see them, their trips or their claims. Open each one and set a manager."
        >
          <DriverTable drivers={unmanaged} />
        </GroupCard>
      ) : null}

      {groups.map((group) => (
        <GroupCard
          key={group.manager.id}
          lead={managerLead(group)}
          title={managerTitle(group)}
          subtitle={managerSubtitle(group)}
          chips={statusChips(group.driversByStatus)}
          count={group.driverCount}
          open={collapse.isOpen(group.manager.id)}
          onToggle={() => collapse.toggle(group.manager.id)}
          emptyText="Nobody works under this manager yet. Invite a driver, or open one and set this manager."
        >
          <DriverTable drivers={group.drivers} />
        </GroupCard>
      ))}
    </div>
  );
}

const DRIVER_COLUMNS =
  'lg:grid-cols-[minmax(190px,1.6fr)_minmax(130px,1fr)_minmax(150px,1.1fr)_minmax(110px,0.8fr)_minmax(110px,0.7fr)]';

function DriverTable({ drivers }: { drivers: ManagerFleetDriver[] }) {
  return (
    <div className="border-t">
      <TableHead columns={DRIVER_COLUMNS} labels={['Driver', 'Truck', 'Licence', 'Workload', 'Status']} />

      <ul className="divide-y">
        {drivers.map((driver) => (
          <li key={driver.id}>
            <Link
              href={`/drivers/${driver.id}`}
              className="focus-ring block px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className={cn('grid gap-3 lg:items-center', DRIVER_COLUMNS)}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={driver.name} color={driver.avatarColor} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{driver.name}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" />
                      <span className="tabular">{driver.mobile ?? driver.email ?? '—'}</span>
                    </p>
                  </div>
                </div>

                <div className="min-w-0">
                  {driver.assignedTruck ? (
                    <span className="flex items-center gap-2 text-sm">
                      <TruckIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate tabular">{driver.assignedTruck.truckNumber}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No truck</span>
                  )}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1.5 truncate text-xs">
                    <IdCard className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate tabular">{driver.licenseNumber ?? '—'}</span>
                  </p>
                  <ExpiryCell date={driver.licenseExpiry} />
                </div>

                <div>
                  {driver.activeTripCount > 0 ? (
                    <Badge variant="default" size="sm">
                      {driver.activeTripCount} active
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">free</span>
                  )}
                </div>

                <div>
                  <StatusBadge status={driver.status} size="sm" />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacks on a phone; becomes a real grid, aligned across every group, from lg up. */
function TableHead({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div
      className={cn(
        'hidden gap-3 border-b bg-muted/30 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground lg:grid',
        columns,
      )}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
