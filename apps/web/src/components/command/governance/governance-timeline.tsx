import type { GovernanceEvent } from '@/lib/data/governance';
import { formatDateTime } from '@/lib/format';

interface Row {
  label: string;
  at: string;
  actor: string | null;
  note: string | null;
}

/**
 * Unified governance history: the audit-trail rows (rich — actor + note) when
 * present, otherwise the structured lifecycle timestamps from the row itself.
 * "Corrective action created" is always the anchor.
 */
export function GovernanceTimeline({
  createdAt,
  structured,
  events,
}: {
  createdAt: string;
  structured: { label: string; at: string }[];
  events: GovernanceEvent[];
}) {
  const rows: Row[] = [
    { label: 'Corrective action created', at: createdAt, actor: null, note: null },
  ];

  if (events.length > 0) {
    for (const e of events) {
      rows.push({ label: e.label, at: e.at, actor: e.actorName, note: e.note });
    }
  } else {
    for (const s of structured) {
      if (s.label.toLowerCase().includes('created')) continue;
      rows.push({ label: s.label, at: s.at, actor: null, note: null });
    }
  }

  rows.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:left-[5px] before:top-1.5 before:h-[calc(100%-0.75rem)] before:w-px before:bg-border">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="relative">
          <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border border-border bg-surface" />
          <p className="text-sm text-primary">{r.label}</p>
          <p className="text-xs text-secondary">
            {r.actor ? `${r.actor} · ` : ''}
            {formatDateTime(r.at)}
          </p>
          {r.note ? (
            <p className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-xs text-secondary">
              {r.note}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
