'use client';

import { UsersView } from '../users/users-view';

export default function ManagersPage() {
  return (
    <UsersView
      title="Managers"
      description="The people running day-to-day fleet operations, and their pending invitations."
      fixedRole="MANAGER"
    />
  );
}
