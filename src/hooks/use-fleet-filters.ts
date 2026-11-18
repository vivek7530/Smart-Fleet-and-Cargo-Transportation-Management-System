'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Page, Truck, UserRecord } from '@/lib/types';
import type { FilterConfig } from '@/components/data/list-toolbar';
import { useAuth } from '@/components/auth-provider';

/**
 * The "who and what" filters — manager, truck, driver — shared by every list
 * that can be narrowed by them.
 *
 * They live in one hook rather than three copies because the three lists have
 * to agree: the same option labels, the same "All managers" wording, and the
 * same rule about who may filter by manager at all. A manager filtering by
 * manager would be asking about somebody else's fleet, which per-manager
 * ownership exists to prevent, so the control is simply absent for them.
 *
 * The option lists are small and change rarely, so they are cached for a
 * minute and shared across pages by query key.
 */
export function useFleetFilterOptions({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const { data: managers } = useQuery({
    queryKey: ['users', 'manager-picker'],
    queryFn: () => api.get<Page<UserRecord>>('/users', { role: 'MANAGER', status: 'ACTIVE', limit: 100 }),
    enabled: enabled && isAdmin,
    staleTime: 60_000,
  });

  const { data: trucks } = useQuery({
    queryKey: ['trucks', 'picker'],
    queryFn: () => api.get<Page<Truck>>('/trucks', { limit: 200 }),
    enabled,
    staleTime: 60_000,
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers', 'picker', 'all'],
    queryFn: () => api.get<Page<UserRecord>>('/drivers', { limit: 200 }),
    enabled,
    staleTime: 60_000,
  });

  return React.useMemo(
    () => ({
      isAdmin,
      managerOptions: [
        { label: 'All managers', value: 'ALL' },
        ...(managers?.items ?? []).map((manager) => ({ label: manager.name, value: manager.id })),
      ],
      truckOptions: [
        { label: 'All trucks', value: 'ALL' },
        ...(trucks?.items ?? []).map((truck) => ({ label: truck.truckNumber, value: truck.id })),
      ],
      driverOptions: [
        { label: 'All drivers', value: 'ALL' },
        ...(drivers?.items ?? []).map((driver) => ({ label: driver.name, value: driver.id })),
      ],
    }),
    [isAdmin, managers, trucks, drivers],
  );
}

/** What a list page's `useListState` gives back, reduced to what this needs. */
interface FilterState {
  filters: Record<string, string | undefined>;
  setFilter: (key: string, value: string) => void;
}

/**
 * Builds the three `FilterConfig`s for a list toolbar.
 *
 * `primary` names the ones that stay on the toolbar rather than folding into
 * the Filters popover — usually just the manager, since that is the one an
 * administrator reaches for most.
 */
export function useFleetFilters(
  list: FilterState,
  {
    include = ['manager', 'truck', 'driver'],
    primary = ['manager'],
    enabled = true,
  }: {
    include?: ('manager' | 'truck' | 'driver')[];
    primary?: ('manager' | 'truck' | 'driver')[];
    enabled?: boolean;
  } = {},
): FilterConfig[] {
  const { isAdmin, managerOptions, truckOptions, driverOptions } = useFleetFilterOptions({ enabled });

  const defs = {
    manager: { key: 'manager', label: 'Manager', options: managerOptions, adminOnly: true },
    truck: { key: 'truck', label: 'Truck', options: truckOptions, adminOnly: false },
    driver: { key: 'driver', label: 'Driver', options: driverOptions, adminOnly: false },
  } as const;

  return include
    .filter((name) => !defs[name].adminOnly || isAdmin)
    .map((name) => {
      const def = defs[name];
      return {
        key: def.key,
        label: def.label,
        value: list.filters[def.key] ?? 'ALL',
        options: def.options,
        onChange: (value: string) => list.setFilter(def.key, value),
        primary: primary.includes(name),
      };
    });
}
