'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package, Route, Search, Truck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { flatNavigationFor } from '@/lib/navigation';
import { useDebounced } from '@/hooks/use-infinite-list';
import type { Cargo, Page, Role, Trip, Truck as TruckType, UserRecord } from '@/lib/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}

/**
 * ⌘K search across navigation plus live records the current role can reach.
 */
export function CommandPalette({ open, onOpenChange, role }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const search = useDebounced(query.trim(), 250);
  const isStaff = role === 'ADMIN' || role === 'MANAGER';

  const navItems = React.useMemo(() => flatNavigationFor(role), [role]);

  const { data, isFetching } = useQuery({
    queryKey: ['command-search', search, role],
    queryFn: async () => {
      const [trips, trucks, cargo, drivers] = await Promise.all([
        api.get<Page<Trip>>('/trips', { search, limit: 5 }).catch(() => null),
        isStaff ? api.get<Page<TruckType>>('/trucks', { search, limit: 5 }).catch(() => null) : null,
        isStaff ? api.get<Page<Cargo>>('/cargo', { search, limit: 5 }).catch(() => null) : null,
        isStaff ? api.get<Page<UserRecord>>('/drivers', { search, limit: 5 }).catch(() => null) : null,
      ]);
      return { trips: trips?.items ?? [], trucks: trucks?.items ?? [], cargo: cargo?.items ?? [], drivers: drivers?.items ?? [] };
    },
    enabled: open && search.length >= 2,
    staleTime: 10_000,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose className="top-[15%] translate-y-0 p-0">
        <DialogTitle className="sr-only">Search CargoEntry</DialogTitle>
        <Command shouldFilter={false} className="overflow-hidden rounded-xl" loop>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search trips, trucks, cargo, drivers or jump to a page…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
            <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground sm:block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center text-[13px] text-muted-foreground">
              {search.length >= 2 ? 'No matches found.' : 'Type at least two characters to search records.'}
            </Command.Empty>

            <CommandGroup heading="Go to">
              {navItems
                .filter((item) => !search || item.label.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <CommandItem key={item.href} onSelect={() => go(item.href)}>
                    <item.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-2xs text-muted-foreground">{item.description}</span>
                  </CommandItem>
                ))}
            </CommandGroup>

            {data?.trips.length ? (
              <CommandGroup heading="Trips">
                {data.trips.map((trip) => (
                  <CommandItem key={trip.id} onSelect={() => go(`/trips/${trip.id}`)}>
                    <Route className="size-4 text-muted-foreground" />
                    <span className="font-medium">{trip.tripCode}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {trip.pickupLocation} → {trip.deliveryLocation}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {data?.trucks.length ? (
              <CommandGroup heading="Trucks">
                {data.trucks.map((truck) => (
                  <CommandItem key={truck.id} onSelect={() => go(`/trucks/${truck.id}`)}>
                    <Truck className="size-4 text-muted-foreground" />
                    <span className="font-medium">{truck.truckNumber}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {truck.make} {truck.model}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {data?.cargo.length ? (
              <CommandGroup heading="Cargo">
                {data.cargo.map((item) => (
                  <CommandItem key={item.id} onSelect={() => go(`/cargo?search=${item.cargoCode}`)}>
                    <Package className="size-4 text-muted-foreground" />
                    <span className="font-medium">{item.cargoCode}</span>
                    <span className="flex-1 truncate text-muted-foreground">{item.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {data?.drivers.length ? (
              <CommandGroup heading="Drivers">
                {data.drivers.map((driver) => (
                  <CommandItem key={driver.id} onSelect={() => go(`/drivers/${driver.id}`)}>
                    <UserRound className="size-4 text-muted-foreground" />
                    <span className="font-medium">{driver.name}</span>
                    <span className="flex-1 truncate text-muted-foreground">{driver.mobile ?? driver.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

function CommandItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
      )}
    >
      {children}
    </Command.Item>
  );
}

/** Registers the ⌘K / Ctrl+K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}
