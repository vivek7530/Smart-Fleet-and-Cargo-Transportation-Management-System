'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { DesktopSidebar, SidebarBrand, SidebarNav, type SidebarCounts } from './sidebar';
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

  // Sidebar badges reuse the dashboard payload the page already needs.
  const { data: counts } = useQuery({
    queryKey: ['sidebar-counts', user?.role],
    queryFn: async () => {
      const dashboard = await api.get<{ kpis: Record<string, number> }>('/reports/dashboard', {
        preset: 'month',
      });
      return {
        pendingExpenses: dashboard.kpis.pendingExpenseCount,
        openBreakdowns: dashboard.kpis.openBreakdowns,
        expiringDocuments: dashboard.kpis.expiringDocuments,
      } satisfies SidebarCounts;
    },
    enabled: Boolean(user),
    staleTime: 60_000,
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
          className="left-0 top-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 grid-rows-[auto_1fr] rounded-none border-y-0 border-l-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <div className="border-b px-3 py-3.5">
            <SidebarBrand />
          </div>
          <div className="flex min-h-0 flex-col">
            <SidebarNav role={user.role} counts={counts} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={user.role}
          onOpenSidebar={() => setMobileNavOpen(true)}
          onOpenSearch={() => commandPalette.setOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[110rem] space-y-6 p-4 pb-16 sm:p-6">{children}</div>
        </main>
      </div>

      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        role={user.role}
      />
    </div>
  );
}

/** Full-shell placeholder shown while the session is being resolved. */
function AppShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-surface p-4 lg:flex">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-32" />
          </div>
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-surface px-4">
          <Skeleton className="h-4 w-32" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
        </header>
        <div className="flex-1 space-y-6 p-6">
          <Skeleton className="h-8 w-56" />
          <div className="grid gap-4 grid-auto-fit">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
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
