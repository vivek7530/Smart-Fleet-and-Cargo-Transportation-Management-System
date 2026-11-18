'use client';

import { Truck } from '@/components/icons';
import { UsersView } from '../users/users-view';
import { FleetByManager } from '../managers/fleet-by-manager';

/**
 * Driver *accounts*, the administrative twin of /managers.
 *
 * Operations → Drivers answers "who is free, who is on a truck". This answers
 * "who has an account, what state is it in, and what is still outstanding" —
 * the same question /managers answers for managers.
 *
 * Its Fleet tab opens on Drivers rather than Trucks: arriving from the Drivers
 * page, the question being asked is which manager each driver works under, and
 * the trucks are the follow-up. On /managers the default is the other way round
 * for the same reason.
 */
export default function DriverAccountsPage() {
  return (
    <UsersView
      title="Drivers"
      description="Driver accounts, their state, and the invitations still outstanding."
      fixedRole="DRIVER"
      extraTabs={[
        {
          value: 'fleet',
          label: 'By manager',
          icon: <Truck />,
          content: <FleetByManager defaultTab="drivers" />,
        },
      ]}
    />
  );
}
