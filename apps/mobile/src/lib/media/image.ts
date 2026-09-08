/**
 * Image handling for field evidence.
 *
 * Field photos off a phone camera are often 3-8 MB. We downscale the long edge
 * to 1600px and re-encode as JPEG q0.6 before upload - readable evidence, ~200-
 * 500 KB, without destroying detail. The ORIGINAL on-device file is left
 * untouched (Milestone 2B-2's offline queue keeps it until the server confirms).
 */
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import type { PendingImage } from './types';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.6;

/** Downscale + compress. Returns a NEW temp file uri (does not touch the source). */
export async function compressForUpload(input: {
  uri: string;
  width?: number;
  height?: number;
}): Promise<{
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number | null;
}> {
  const longEdge = Math.max(input.width ?? 0, input.height ?? 0);
  const actions: ImageManipulator.Action[] =
    longEdge > MAX_EDGE
      ? [
          {
            resize:
              (input.width ?? 0) >= (input.height ?? 0)
                ? { width: MAX_EDGE }
                : { height: MAX_EDGE },
          },
        ]
      : [];

  const result = await ImageManipulator.manipulateAsync(input.uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: 'image/jpeg',
    fileSize: await getFileSize(result.uri),
  };
}

export async function getFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Read a local file into an ArrayBuffer for the Supabase Storage upload.
 * base64 -> bytes via Hermes' built-in atob (React Native 0.74+).
 */
export async function readAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Human file name for the evidence row. */
export function makeFileName(clientRef: string): string {
  return `evidence-${clientRef.slice(0, 8)}.jpg`;
}

export type { PendingImage };
