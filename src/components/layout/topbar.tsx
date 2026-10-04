'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Monitor, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flatNavigationFor } from '@/lib/navigation';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import type { Role } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, Separator } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationsMenu } from './notifications-menu';

export function Topbar({
  role,
  onOpenSidebar,
  onOpenSearch,
}: {
  role: Role;
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Title comes from the navigation entry that owns the current route.
  const current = React.useMemo(() => {
    const items = flatNavigationFor(role);
    return (
      items.find((item) => pathname === item.href) ??
      items.find((item) => pathname.startsWith(`${item.href}/`))
    );
  }, [pathname, role]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-surface/85 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{current?.label ?? 'CargoEntry'}</h2>
        {current?.description ? (
          <p className="hidden truncate text-2xs text-muted-foreground sm:block">{current.description}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-[13px] text-muted-foreground shadow-xs transition-colors hover:bg-accent/60 focus-ring md:flex xl:w-72"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-2xs">⌘K</kbd>
      </button>

      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenSearch} aria-label="Search">
        <Search />
      </Button>

      <NotificationsMenu />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent focus-ring"
            aria-label="Account menu"
          >
            <Avatar name={user?.name} color={user?.avatarColor} size="sm" />
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-32 truncate text-[13px] font-medium leading-tight">{user?.name}</span>
              <span className="block text-2xs capitalize leading-tight text-muted-foreground">
                {user?.role.toLowerCase()}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={user?.name} color={user?.avatarColor} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{user?.name}</p>
              <p className="truncate text-2xs text-muted-foreground">{user?.email ?? user?.mobile}</p>
              <Badge variant="neutral" size="sm" className="mt-1">
                {user?.role}
              </Badge>
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href={role === 'DRIVER' ? '/profile' : '/settings'}>
              <User />
              My profile
            </Link>
          </DropdownMenuItem>
          {role !== 'DRIVER' ? (
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings />
                Settings
              </Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
            <DropdownMenuRadioItem value="light">
              <Sun className="mr-2 size-4" />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="mr-2 size-4" />
              Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="mr-2 size-4" />
              System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export { Separator as TopbarSeparator };
