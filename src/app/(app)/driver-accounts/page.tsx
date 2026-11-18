'use client';

import { UsersView } from '../users/users-view';

/**
 * Driver *accounts*, the administrative twin of /managers.
 *
 * Operations → Drivers answers "who is free, who is on a truck". This answers
 * "who has an account, what state is it in, and what is still outstanding" —
 * the same question /managers answers for managers.
 */
export default function DriverAccountsPage() {
  return (
    <UsersView
      title="Drivers"
      description="Driver accounts, their state, and the invitations still outstanding."
      fixedRole="DRIVER"
    />
  );
}
