import { AppShell } from '@/components/layout/app-shell';

/**
 * Every screen in this group is specific to the signed-in user, so there is
 * nothing worth prerendering — rendering it per request also keeps
 * `useSearchParams` usage inside the pages straightforward.
 */
export const dynamic = 'force-dynamic';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
