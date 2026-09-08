/**
 * Thin, honest wrappers around the Expo permission APIs. Each returns
 * `{ granted, canAskAgain }` so the UI can either re-prompt or send the user to
 * system settings - and never pretends a denied permission was granted.
 */
import { Linking } from 'react-native';
import {
  requestMediaLibraryPermissionsAsync,
  getMediaLibraryPermissionsAsync,
} from 'expo-image-picker';
import { requestForegroundPermissionsAsync, getForegroundPermissionsAsync } from 'expo-location';
import type { PermissionResult } from './types';

// Camera permission is handled inside CameraCaptureModal via the
// `useCameraPermissions()` hook from expo-camera.

const toResult = (p: { granted: boolean; canAskAgain: boolean }): PermissionResult => ({
  granted: p.granted,
  canAskAgain: p.canAskAgain,
});

export async function ensureLibraryPermission(): Promise<PermissionResult> {
  const current = await getMediaLibraryPermissionsAsync();
  if (current.granted) return toResult(current);
  return toResult(await requestMediaLibraryPermissionsAsync());
}

export async function ensureLocationPermission(): Promise<PermissionResult> {
  const current = await getForegroundPermissionsAsync();
  if (current.granted) return toResult(current);
  return toResult(await requestForegroundPermissionsAsync());
}

/** Open the OS settings page so the user can grant a blocked permission. */
export function openSystemSettings(): void {
  void Linking.openSettings();
}
