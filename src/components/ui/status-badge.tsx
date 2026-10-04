import { Badge, type BadgeProps } from './badge';
import { humanise } from '@/lib/utils';

type Variant = NonNullable<BadgeProps['variant']>;

/**
 * One place that decides how every status in the system is coloured, so the
 * same state always looks the same wherever it appears.
 */
const STATUS_VARIANTS: Record<string, Variant> = {
  // Trucks
  AVAILABLE: 'success',
  ASSIGNED: 'info',
  IN_TRIP: 'default',
  MAINTENANCE: 'warning',
  INACTIVE: 'neutral',

  // Trips
  PLANNED: 'neutral',
  LOADING: 'warning',
  IN_TRANSIT: 'default',
  DELIVERED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',

  // Users / invitations
  ACTIVE: 'success',
  INVITED: 'warning',
  SUSPENDED: 'danger',
  PENDING: 'warning',
  ACCEPTED: 'success',
  EXPIRED: 'danger',
  REVOKED: 'neutral',
  NONE: 'neutral',

  // Expenses / documents
  APPROVED: 'success',
  REJECTED: 'danger',
  VERIFIED: 'success',

  // Maintenance
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',

  // Breakdowns
  REPORTED: 'danger',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',

  // Cargo
  LOADED: 'info',

  // Severity
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',

  // Roles
  ADMIN: 'default',
  MANAGER: 'info',
  DRIVER: 'neutral',
};

export function statusVariant(status?: string | null): Variant {
  return (status && STATUS_VARIANTS[status]) || 'neutral';
}

export function StatusBadge({
  status,
  size,
  className,
  dot = true,
}: {
  status?: string | null;
  size?: BadgeProps['size'];
  className?: string;
  dot?: boolean;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={statusVariant(status)} size={size} dot={dot} className={className}>
      {humanise(status)}
    </Badge>
  );
}
