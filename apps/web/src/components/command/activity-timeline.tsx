import Link from 'next/link';
import {
  Activity,
  Camera,
  ClipboardCheck,
  ClipboardList,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ActivityItem, ActivityKind } from '@/lib/data/dashboard';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';

const ICON: Record<ActivityKind, LucideIcon> = {
  inspection_submitted: ClipboardCheck,
  inspection_created: ClipboardList,
  observation_created: TriangleAlert,
  evidence_uploaded: Camera,
  corrective_action_assigned: Wrench,
  corrective_action_updated: Wrench,
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No recent field activity"
        message="Activity from the field app will appear here as inspections are submitted."
        compact
      />
    );
  }

  return (
    <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
      {items.map((item) => {
        const Icon = ICON[item.kind];
        const body = (
          <>
            <span className="block text-sm text-primary group-hover:underline">
              {item.description}
            </span>
            <span className="mt-0.5 block text-xs text-secondary">
              {item.actor ? `${item.actor} · ` : ''}
              {item.mineName ? `${item.mineName} · ` : ''}
              {formatRelative(item.timestamp)}
            </span>
          </>
        );
        return (
          <li key={item.id} className="relative flex gap-3">
            <span className="z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-secondary">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              {item.href ? (
                <Link href={item.href} className="group block">
                  {body}
                </Link>
              ) : (
                <div className="group">{body}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
