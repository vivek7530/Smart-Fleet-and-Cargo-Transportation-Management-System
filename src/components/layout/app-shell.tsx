'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useAuth } from '@/components/auth-provider';
import { dashboardQuery } from '@/lib/queries';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LogoMark } from '@/components/brand/logo';
import { DesktopSidebar, SidebarPanel, type SidebarCounts } from './sidebar';
import { Topbar } from './topbar';
import { CommandPalette, useCommandPalette } from './command-palette';

/**
 * Authenticated layout: guards the route, then renders the role-aware sidebar,
 * top bar and page content.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const commandPalette = useCommandPalette();

  React.useEffect(() => {
    if (!isLoading && !user) {
      const next = pathname && pathname !== '/dashboard' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [isLoading, user, router, pathname]);

  // Sidebar badges read the same cached payload the dashboard uses.
  const { data: counts } = useQuery({
    ...dashboardQuery(user?.role),
    select: (dashboard): SidebarCounts => {
      const kpis = (dashboard as { kpis?: Record<string, number> }).kpis ?? {};
      return {
        pendingExpenses: kpis.pendingExpenseCount,
        openBreakdowns: kpis.openBreakdowns,
        expiringDocuments: kpis.expiringDocuments,
      };
    },
  });

  if (isLoading || !user) return <AppShellSkeleton />;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <DesktopSidebar role={user.role} counts={counts} />

      {/* Mobile navigation drawer. */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent
          size="sm"
          hideClose
          className="left-0 top-0 block h-dvh max-h-dvh w-[264px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-0 bg-sidebar p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarPanel
            role={user.role}
            counts={counts}
            scope="mobile"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={user.role}
          onOpenSidebar={() => setMobileNavOpen(true)}
          onOpenSearch={() => commandPalette.setOpen(true)}
        />

        <main className="relative flex-1 overflow-y-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[110rem] space-y-6 p-4 pb-16 sm:p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <CommandPalette open={commandPalette.open} onOpenChange={commandPalette.setOpen} role={user.role} />
    </div>
  );
}

/** Mirrors the real shell (ink sidebar, 64px top bar) so nothing jumps when it resolves. */
function AppShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background" aria-busy="true" aria-label="Loading workspace">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <LogoMark className="h-8" />
          <Skeleton className="h-3.5 w-24 rounded-full" />
        </div>
        <div className="space-y-5 px-3 pt-2">
          {[1, 5, 4, 3].map((rows, group) => (
            <div key={group} className="space-y-1">
              {group > 0 ? <Skeleton className="mx-2.5 mb-2 h-2.5 w-16 rounded-full" /> : null}
              {Array.from({ length: rows }).map((_, index) => (
                <div key={index} className="flex h-9 items-center gap-2.5 px-2.5">
                  <Skeleton className="size-[18px] rounded-md" />
                  <Skeleton className="h-2.5 rounded-full" style={{ width: `${44 + ((index * 23) % 36)}%` }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b px-4 sm:px-6">
          <Skeleton className="h-3.5 w-44 rounded-full" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="hidden h-9 w-72 rounded-lg md:block" />
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </header>
        <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64 rounded-lg" />
            <Skeleton className="h-3.5 w-96 max-w-full rounded-full" />
          </div>
          <div className="grid gap-4 grid-auto-fit">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[124px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-[360px] rounded-xl lg:col-span-2" />
            <Skeleton className="h-[360px] rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Blocks a page for roles that must not see it, mirroring the API's rules. */
export function RoleGate({
  allow,
  children,
  fallback,
}: {
  allow: Array<'ADMIN' | 'MANAGER' | 'DRIVER'>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  if (!allow.includes(user.role)) {
    return (
      fallback ?? (
        <div className="surface-card p-10 text-center">
          <h2 className="text-base font-semibold">You do not have access to this page</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Your role ({user.role.toLowerCase()}) is not permitted to view this section.
          </p>
        </div>
      )
    );
  }
  return <>{children}</>;
}
