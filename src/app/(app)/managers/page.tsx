'use client';

import { Truck } from '@/components/icons';
import { UsersView } from '../users/users-view';
import { FleetByManager } from './fleet-by-manager';

export default function ManagersPage() {
  return (
    <UsersView
      title="Managers"
      description="The people running day-to-day fleet operations, and their pending invitations."
      fixedRole="MANAGER"
      extraTabs={[
        {
          value: 'fleet',
          label: 'Fleet',
          icon: <Truck />,
          content: <FleetByManager />,
        },
      ]}
    />
  );
}
