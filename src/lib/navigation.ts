import type { Icon } from '@/components/icons';
import {
  BadgeIndianRupee,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Fuel,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wrench,
} from '@/components/icons';
import type { Role } from './types';

export interface NavItem {
  label: string;
  href: string;
  icon: Icon;
  /** Roles allowed to see the entry — the API enforces the real boundary. */
  roles: Role[];
  /** Key of a badge count supplied by the layout (e.g. pending expenses). */
  badge?: 'pendingExpenses' | 'openBreakdowns' | 'expiringDocuments';
  description?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const ALL: Role[] = ['ADMIN', 'MANAGER', 'DRIVER'];
const STAFF: Role[] = ['ADMIN', 'MANAGER'];

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ALL,
        description: 'Fleet overview and key figures',
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Trips', href: '/trips', icon: Route, roles: STAFF, description: 'Plan, dispatch and close trips' },
      { label: 'My Trips', href: '/my-trips', icon: Route, roles: ['DRIVER'], description: 'Trips assigned to you' },
      { label: 'Trucks', href: '/trucks', icon: Truck, roles: STAFF, description: 'The vehicle fleet' },
      { label: 'My Truck', href: '/my-truck', icon: Truck, roles: ['DRIVER'], description: 'The truck assigned to you' },
      { label: 'Cargo', href: '/cargo', icon: Package, roles: STAFF, description: 'Consignments and shipments' },
      { label: 'Drivers', href: '/drivers', icon: UserRound, roles: STAFF, description: 'Driver roster' },
    ],
  },
  {
    title: 'Costs',
    items: [
      { label: 'Fuel', href: '/fuel', icon: Fuel, roles: ALL, description: 'Fuel purchases' },
      { label: 'Maintenance', href: '/maintenance', icon: Wrench, roles: ALL, description: 'Service and repairs' },
      {
        label: 'Expenses',
        href: '/expenses',
        icon: BadgeIndianRupee,
        roles: ALL,
        badge: 'pendingExpenses',
        description: 'Driver expense claims',
      },
      {
        label: 'Trip Costs',
        href: '/transportation-costs',
        icon: CircleDollarSign,
        roles: STAFF,
        description: 'Tolls, permits and handling',
      },
    ],
  },
  {
    title: 'Compliance',
    items: [
      {
        label: 'Documents',
        href: '/documents',
        icon: FileText,
        roles: ALL,
        badge: 'expiringDocuments',
        description: 'Insurance, permits and receipts',
      },
      {
        label: 'Breakdowns',
        href: '/breakdowns',
        icon: LifeBuoy,
        roles: ALL,
        badge: 'openBreakdowns',
        description: 'Roadside incidents',
      },
      { label: 'Reports', href: '/reports', icon: ClipboardList, roles: STAFF, description: 'Revenue, cost and profit analysis' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', href: '/users', icon: Users, roles: ['ADMIN'], description: 'Everyone in the system' },
      { label: 'Managers', href: '/managers', icon: UserCog, roles: ['ADMIN'], description: 'Manager accounts and activity' },
      { label: 'Audit Log', href: '/audit-logs', icon: ScrollText, roles: ['ADMIN'], description: 'Who did what, and when' },
    ],
  },
  {
    items: [
      { label: 'Profile', href: '/profile', icon: ShieldCheck, roles: ['DRIVER'], description: 'Your details' },
      { label: 'Settings', href: '/settings', icon: Settings, roles: STAFF, description: 'Account and preferences' },
    ],
  },
];

/** Filters the navigation down to the sections a role can actually reach. */
export function navigationFor(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export function flatNavigationFor(role: Role): NavItem[] {
  return navigationFor(role).flatMap((section) => section.items);
}
