'use client';

import { ProfileSettings } from '../settings/profile-settings';

export default function ProfilePage() {
  return (
    <ProfileSettings
      title="My profile"
      description="Keep your licence and contact details current so dispatch can always reach you."
    />
  );
}
