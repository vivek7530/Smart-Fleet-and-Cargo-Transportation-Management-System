'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { LogOut } from '@/components/icons';
import { cn } from '@/lib/utils';
import { navigationFor } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';
import { Logo } from '@/components/brand/logo';
import { Avatar, Tooltip } from '@/components/ui/misc';

export interface SidebarCounts {
  pendingExpenses?: number;
  openBreakdowns?: number;
  expiringDocuments?: number;
}

export function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center rounded-lg px-1.5 py-1 focus-ring" aria-label="CargoEntry home">
      <Logo tagline="Fleet operations" markClassName="h-8" />
    </Link>
  );
}

export function SidebarNav({
  role,
  counts,
  onNavigate,
  scope = 'desktop',
}: {
  role: Role;
  counts?: SidebarCounts;
  onNavigate?: () => void;
  /** Keeps the sliding highlight of the desktop and mobile navs independent. */
  scope?: string;
}) {
  const pathname = usePathname();
  const sections = React.useMemo(() => navigationFor(role), [role]);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Main">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className={cn(index > 0 && 'mt-5')}>
          {section.title ? (
            <p className="mb-1 px-2.5 text-xs font-medium text-sidebar-muted">{section.title}</p>
          ) : null}

          <div className="space-y-px">
            {section.items.map((item) => {
              // `/trips` should stay highlighted while viewing `/trips/:id`.
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = item.badge ? counts?.[item.badge] : undefined;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150 focus-ring',
                    active
                      ? 'text-sidebar-active-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-active-foreground',
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={`${scope}-nav-active`}
                      className="absolute inset-0 rounded-lg bg-sidebar-active"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  ) : null}
                  <item.icon
                    filled={active}
                    className={cn(
                      'relative size-[18px] shrink-0 transition-colors duration-150',
                      active ? 'text-primary' : 'text-sidebar-muted group-hover:text-sidebar-active-foreground',
                    )}
                  />
                  <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
                  {count ? (
                    <span
                      className={cn(
                        'relative text-xs font-medium tabular',
                        item.badge === 'openBreakdowns' ? 'text-destructive' : 'text-sidebar-muted',
                      )}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarUser() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
      <Avatar name={user.name} color={user.avatarColor} size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-semibold text-sidebar-active-foreground">{user.name}</p>
        <p className="truncate text-xs capitalize text-sidebar-muted">{user.role.toLowerCase()}</p>
      </div>
      <Tooltip label="Sign out" side="right">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-active-foreground focus-ring"
          aria-label="Sign out"
        >
          <LogOut className="size-[18px]" />
        </button>
      </Tooltip>
    </div>
  );
}

/** Full-height panel used on desktop and inside the mobile drawer. */
export function SidebarPanel({
  role,
  counts,
  onNavigate,
  scope,
  className,
}: {
  role: Role;
  counts?: SidebarCounts;
  onNavigate?: () => void;
  scope?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground', className)}>
      <div className="flex h-16 shrink-0 items-center px-4">
        <SidebarBrand />
      </div>
      <SidebarNav role={role} counts={counts} onNavigate={onNavigate} scope={scope} />
      <SidebarUser />
    </div>
  );
}

export function DesktopSidebar({ role, counts }: { role: Role; counts?: SidebarCounts }) {
  return (
    <aside className="hidden w-[248px] shrink-0 border-r border-sidebar-border lg:block">
      <SidebarPanel role={role} counts={counts} scope="desktop" />
    </aside>
  );
}
