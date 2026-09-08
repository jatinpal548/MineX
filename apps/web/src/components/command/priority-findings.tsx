import Link from 'next/link';
import { MapPin, Paperclip, ShieldAlert } from 'lucide-react';
import type { PriorityFinding } from '@/lib/data/dashboard';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskTag, ObservationStatusTag, CorrectiveActionStatusTag } from '@/components/ui/status-badge';
import { formatRelative, formatCoords } from '@/lib/format';

export function PriorityFindings({ findings }: { findings: PriorityFinding[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No priority findings"
        message="No unresolved high-risk observations right now."
        compact
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {findings.map((f) => (
        <li key={f.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <RiskTag risk={f.risk} />
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/observations/${f.id}`}
                className="block truncate text-sm font-medium text-primary underline-offset-2 hover:text-accent-600 hover:underline"
              >
                {f.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                {f.mineName ? <span>{f.mineName}</span> : null}
                {f.inspectorName ? <span>· {f.inspectorName}</span> : null}
                <span>· {formatRelative(f.createdAt)}</span>
                {f.coords ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" strokeWidth={2} />
                    {formatCoords(f.coords.lat, f.coords.lng)}
                  </span>
                ) : null}
                {f.evidenceCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3 w-3" strokeWidth={2} />
                    {f.evidenceCount}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ObservationStatusTag status={f.status} />
              {f.correctiveActionStatus ? (
                <CorrectiveActionStatusTag status={f.correctiveActionStatus} />
              ) : (
                <span className="text-xs text-secondary">No action</span>
              )}
              {f.assigneeName ? (
                <span className="text-xs text-secondary">{f.assigneeName}</span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
