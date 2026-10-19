'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, User } from '@/components/icons';
import { navigationFor } from '@/lib/navigation';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import type { Role } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, Separator, Tooltip } from '@/components/ui/misc';
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
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Title and section come from the navigation entry that owns the current route.
  const current = React.useMemo(() => {
    for (const section of navigationFor(role)) {
      const item =
        section.items.find((entry) => pathname === entry.href) ??
        section.items.find((entry) => pathname.startsWith(`${entry.href}/`));
      if (item) return { item, section: section.title ?? 'Workspace' };
    }
    return null;
  }, [pathname, role]);

  const isDetail = Boolean(current && pathname !== current.item.href);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-surface/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
      >
        <Menu />
      </Button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.ol
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-w-0 items-center gap-1.5 text-sm"
          >
            <li className="hidden truncate text-muted-foreground sm:block">{current?.section ?? 'Workspace'}</li>
            <li className="hidden text-muted-foreground/60 sm:block" aria-hidden>
              <ChevronRight className="size-4" />
            </li>
            <li className={isDetail ? 'truncate text-muted-foreground' : 'truncate font-semibold'}>
              {isDetail && current ? (
                <Link href={current.item.href} className="transition-colors hover:text-foreground">
                  {current.item.label}
                </Link>
              ) : (
                (current?.item.label ?? 'CargoEntry')
              )}
            </li>
            {isDetail ? (
              <>
                <li className="text-muted-foreground/60" aria-hidden>
                  <ChevronRight className="size-4" />
                </li>
                <li className="truncate font-semibold">Details</li>
              </>
            ) : null}
          </motion.ol>
        </AnimatePresence>
      </nav>

      <button
        type="button"
        onClick={onOpenSearch}
        className="group hidden h-9 w-60 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-[13px] text-muted-foreground transition-colors hover:border-input hover:bg-surface focus-ring md:flex xl:w-72"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-surface px-1.5 py-px font-sans text-[11px] font-medium">Ctrl K</kbd>
      </button>

      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenSearch} aria-label="Search">
        <Search />
      </Button>

      <Tooltip label={resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle colour theme"
          className="hidden sm:inline-flex"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={resolvedTheme}
              initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
              className="flex"
            >
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </Tooltip>

      <NotificationsMenu />

      <Separator orientation="vertical" className="mx-1 hidden h-7 sm:block" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent focus-ring"
            aria-label="Account menu"
          >
            <Avatar name={user?.name} color={user?.avatarColor} size="sm" />
            <span className="hidden min-w-0 text-left lg:block">
              <span className="block max-w-36 truncate text-[13px] font-semibold leading-tight">{user?.name}</span>
              <span className="block text-[11px] capitalize leading-tight text-muted-foreground">
                {user?.role.toLowerCase()}
              </span>
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground lg:block" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <div className="flex items-center gap-3 px-2 py-2.5">
            <Avatar name={user?.name} color={user?.avatarColor} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold">{user?.name}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">{user?.email ?? user?.mobile}</p>
              <Badge variant="default" size="sm" className="mt-1">
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
