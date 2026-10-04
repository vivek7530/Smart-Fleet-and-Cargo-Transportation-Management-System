'use client';

import { TripsView } from '../trips/trips-view';

/** The driver-facing view of the same trip list, scoped server-side. */
export default function MyTripsPage() {
  return (
    <TripsView
      title="My trips"
      description="Everything assigned to you — start a trip, update its progress and record what you spend."
    />
  );
}
