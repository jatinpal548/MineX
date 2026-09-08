/**
 * Real microphone recording via expo-av (SDK 52 bundled: expo-av ~15.0).
 *
 * The recorder writes a temp .m4a; `stopRecording()` returns its uri + duration.
 * The caller then copies it into a persistent app dir (see evidence.ts) and
 * queues it for upload. Nothing here fabricates audio.
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export interface AudioPermission {
  granted: boolean;
  canAskAgain: boolean;
}

export async function ensureMicPermission(): Promise<AudioPermission> {
  const current = await Audio.getPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: current.canAskAgain };
  const req = await Audio.requestPermissionsAsync();
  return { granted: req.granted, canAskAgain: req.canAskAgain };
}

let activeRecording: Audio.Recording | null = null;

export async function startRecording(): Promise<{ ok: true } | { ok: false; reason: 'permission' | 'busy' | 'error' }> {
  if (activeRecording) return { ok: false, reason: 'busy' };
  const perm = await ensureMicPermission();
  if (!perm.granted) return { ok: false, reason: 'permission' };
  try {
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    activeRecording = recording;
    return { ok: true };
  } catch {
    activeRecording = null;
    return { ok: false, reason: 'error' };
  }
}

export interface RecordedAudio {
  uri: string;
  durationMs: number;
  sizeBytes: number | null;
}

export async function stopRecording(): Promise<RecordedAudio | null> {
  const rec = activeRecording;
  activeRecording = null;
  if (!rec) return null;
  try {
    const status = await rec.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    const uri = rec.getURI();
    if (!uri) return null;
    let sizeBytes: number | null = null;
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      sizeBytes = info.exists && 'size' in info ? (info.size ?? null) : null;
    } catch {
      /* non-fatal */
    }
    return { uri, durationMs: status.durationMillis ?? 0, sizeBytes };
  } catch {
    return null;
  }
}

/** Recording elapsed time, polled by the UI while recording. */
export async function recordingStatus(): Promise<number> {
  if (!activeRecording) return 0;
  try {
    const s = await activeRecording.getStatusAsync();
    return s.canRecord ? (s.durationMillis ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function cancelActiveRecording(): Promise<void> {
  const rec = activeRecording;
  activeRecording = null;
  if (!rec) return;
  try {
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI();
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
