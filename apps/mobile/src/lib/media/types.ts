/** Shared shapes for the evidence + location capture layer (Milestone 2B-1). */

/** A photo the inspector has picked/taken but not yet uploaded. */
export interface PendingImage {
  /** local file:// uri (still on device) */
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  /** bytes, best-effort */
  fileSize: number | null;
  /** ISO - when the photo was taken/selected on this device */
  capturedAt: string;
  /** true => demo/synthetic image, must show "SIMULATED FIELD EVIDENCE" */
  simulated: boolean;
  /** how it was obtained */
  source: 'camera' | 'library' | 'simulated';
}

export type LocationStatus = 'captured' | 'denied' | 'blocked' | 'unavailable' | 'timeout' | 'idle';

export interface LocationResult {
  status: LocationStatus;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface PermissionResult {
  granted: boolean;
  /** false => the user must change it in system settings */
  canAskAgain: boolean;
}
