import { ImageOff, MapPin } from 'lucide-react';
import { SIMULATED_EVIDENCE_LABEL } from '@coalguard/config';
import type { EvidenceItem } from '@/lib/data/inspections';
import { signEvidencePaths } from '@/lib/data/evidence';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCoords, formatDateTime } from '@/lib/format';

/**
 * Server component: mints signed URLs for the private evidence objects and
 * renders them. A simulated photo ALWAYS carries the "SIMULATED FIELD EVIDENCE"
 * label - it is never hidden.
 */
export async function EvidenceGrid({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState icon={ImageOff} title="No evidence attached" compact />
    );
  }

  const urls = await signEvidencePaths(items.map((i) => i.storagePath));

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const url = urls[item.storagePath] ?? null;
        const isImage = (item.mimeType ?? 'image/').startsWith('image/');
        return (
          <li key={item.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="relative aspect-square bg-surface-muted">
              {url && isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={item.caption ?? item.fileName ?? 'Inspection evidence'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-secondary">
                  <ImageOff className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-[11px]">
                    {url ? item.evidenceType : 'Preview unavailable'}
                  </span>
                </div>
              )}
              {item.isSimulated ? (
                <span className="absolute inset-x-0 bottom-0 bg-warning-600/95 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
                  {SIMULATED_EVIDENCE_LABEL}
                </span>
              ) : null}
            </div>
            <div className="space-y-1 p-2.5 text-xs text-secondary">
              {item.caption ? <p className="text-primary">{item.caption}</p> : null}
              {item.capturedAt ? <p>{formatDateTime(item.capturedAt)}</p> : null}
              {item.coords ? (
                <p className="inline-flex items-center gap-1 font-mono">
                  <MapPin className="h-3 w-3" strokeWidth={2} />
                  {formatCoords(item.coords.lat, item.coords.lng)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
