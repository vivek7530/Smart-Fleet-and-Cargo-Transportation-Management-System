import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

/**
 * Renders an expiry date and flags it once it is close or already past.
 * Shared by trucks, drivers, documents and the driver's own truck view.
 */
export function ExpiryCell({ date }: { date?: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;

  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);

  if (days < 0) {
    return (
      <Badge variant="danger" size="sm">
        Expired
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="warning" size="sm">
        {days}d left
      </Badge>
    );
  }
  return <span className="tabular text-muted-foreground">{formatDate(date, 'd MMM yy')}</span>;
}
