'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigationFor } from '@/lib/navigation';
import type { Role } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export interface SidebarCounts {
  pendingExpenses?: number;
  openBreakdowns?: number;
  expiringDocuments?: number;
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/60 focus-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
        <Truck className="size-4.5" strokeWidth={2.25} />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">CargoEntry</span>
          <span className="block truncate text-2xs text-muted-foreground">Fleet &amp; cargo management</span>
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarNav({
  role,
  counts,
  onNavigate,
}: {
  role: Role;
  counts?: SidebarCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = React.useMemo(() => navigationFor(role), [role]);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main">
      {sections.map((section, index) => (
        <div key={section.title ?? `section-${index}`} className="space-y-1">
          {section.title ? (
            <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              {section.title}
            </p>
          ) : null}

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
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-ring',
                  active
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon
                  className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground/80')}
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count ? (
                  <Badge variant={active ? 'default' : 'neutral'} size="sm" className="tabular">
                    {count > 99 ? '99+' : count}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DesktopSidebar({ role, counts }: { role: Role; counts?: SidebarCounts }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-surface lg:flex">
      <div className="px-3 py-3.5">
        <SidebarBrand />
      </div>
      <SidebarNav role={role} counts={counts} />
      <div className="border-t px-4 py-3">
        <p className="text-2xs text-muted-foreground">
          CargoEntry v1.0 · <span className="capitalize">{role.toLowerCase()}</span> workspace
        </p>
      </div>
    </aside>
  );
}
