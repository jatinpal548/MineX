import { formatDateTime } from '@/lib/format';

export function Timeline({ events }: { events: { label: string; at: string }[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-secondary">No timeline events yet.</p>;
  }
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:left-[5px] before:top-1.5 before:h-[calc(100%-0.75rem)] before:w-px before:bg-border">
      {events.map((e, i) => (
        <li key={`${e.label}-${i}`} className="relative">
          <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border border-border bg-surface" />
          <p className="text-sm text-primary">{e.label}</p>
          <p className="text-xs text-secondary">{formatDateTime(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}
