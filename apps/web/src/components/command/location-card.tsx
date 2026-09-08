import { MapPin } from 'lucide-react';
import { formatCoords } from '@/lib/format';

/**
 * A deliberately simple location representation for M3A - no GIS map yet.
 * Shows the raw coordinates and a link out to a map provider.
 */
export function LocationCard({
  coords,
}: {
  coords: { lat: number; lng: number } | null;
}) {
  if (!coords) {
    return <p className="text-sm text-secondary">No GPS coordinates were captured.</p>;
  }
  const label = formatCoords(coords.lat, coords.lng);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-surface-muted text-secondary">
          <MapPin className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="cg-label">Captured location</p>
          <p className="font-mono text-sm text-primary">{label}</p>
        </div>
      </div>
      <a
        href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=15/${coords.lat}/${coords.lng}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium text-accent-600 underline-offset-2 hover:underline"
      >
        View on map
      </a>
    </div>
  );
}
