/**
 * Real device location capture. Never fabricates coordinates.
 *
 * Returns a discriminated result so the UI can show the true state:
 *   captured | denied | blocked | unavailable | timeout
 */
import { Accuracy, getCurrentPositionAsync } from 'expo-location';
import { ensureLocationPermission } from '@/lib/media/permissions';
import type { LocationResult } from '@/lib/media/types';

const TIMEOUT_MS = 15_000;

export async function captureLocation(): Promise<LocationResult> {
  const perm = await ensureLocationPermission();
  if (!perm.granted) {
    return { status: perm.canAskAgain ? 'denied' : 'blocked' };
  }

  try {
    const position = await Promise.race([
      getCurrentPositionAsync({ accuracy: Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);

    return {
      status: 'captured',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  } catch (e) {
    return { status: e instanceof Error && e.message === 'timeout' ? 'timeout' : 'unavailable' };
  }
}

/** "18.2456, 82.6781" - trimmed precision for the UI. */
export function formatCoords(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '-';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
