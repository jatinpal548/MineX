/**
 * Pick an existing image from the device library.
 *
 * Used for "Upload Evidence" and for the demo "Simulated field evidence" path.
 * When `simulated` is true the returned image is flagged so the UI and the
 * `evidence.is_simulated` column mark it as synthetic - it is NEVER presented as
 * a real mine photograph.
 */
import * as ImagePicker from 'expo-image-picker';
import { ensureLibraryPermission, openSystemSettings } from './permissions';
import { getFileSize } from './image';
import type { PendingImage } from './types';

export interface PickOutcome {
  image: PendingImage | null;
  /** set when the pick could not proceed */
  error?: 'permission-blocked' | 'permission-denied' | 'failed';
}

export async function pickFromLibrary(simulated: boolean): Promise<PickOutcome> {
  const perm = await ensureLibraryPermission();
  if (!perm.granted && !perm.canAskAgain) {
    openSystemSettings();
    return { image: null, error: 'permission-blocked' };
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) return { image: null };

    const asset = result.assets[0]!;
    return {
      image: {
        uri: asset.uri,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileSize: asset.fileSize ?? (await getFileSize(asset.uri)),
        capturedAt: new Date().toISOString(),
        simulated,
        source: simulated ? 'simulated' : 'library',
      },
    };
  } catch {
    return { image: null, error: 'failed' };
  }
}
