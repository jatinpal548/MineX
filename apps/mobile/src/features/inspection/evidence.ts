/**
 * Evidence: local preparation + Storage upload + metadata row.
 *
 * Offline-first (Milestone 2B-2):
 *   1. prepareEvidence()  - compress + copy the photo into a PERSISTENT app dir
 *                           (survives app restart / cache eviction). Runs on
 *                           capture, no network.
 *   2. uploadPreparedEvidence() - read the persistent file -> upload to the
 *                           private `evidence` bucket -> upsert the `evidence`
 *                           row -> delete the local copy. Run by the sync engine
 *                           when online.
 *
 * `id` is a client UUID used as BOTH the local id and the server row id, so a
 * replay from the sync queue is idempotent (`upsert` on the row, `upsert` on the
 * object key).
 */
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { newId } from '@/lib/ids';
import { compressForUpload, makeFileName } from '@/lib/media/image';
import { readAsArrayBuffer } from '@/lib/media/image';
import type { PendingImage } from '@/lib/media/types';
import { AuthExpiredError, OfflineError } from './repository';

const BUCKET = 'evidence';
const EVIDENCE_DIR = `${FileSystem.documentDirectory ?? ''}evidence/`;
const VOICE_DIR = `${FileSystem.documentDirectory ?? ''}voice/`;

export interface EvidenceRow {
  id: string;
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isSimulated: boolean;
  caption: string | null;
  capturedAt: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  createdAt: string;
}

/** A photo that has been compressed and saved locally, ready to upload. */
export interface PreparedEvidence {
  id: string;
  localUri: string;
  mimeType: string;
  fileSize: number | null;
  isSimulated: boolean;
  capturedAt: string;
}

function classify(cause: unknown): 'network' | 'auth' | 'server' {
  const e = cause as { message?: string; name?: string; status?: number } | undefined;
  const msg = (e?.message ?? '').toLowerCase();
  if (
    e?.name === 'AbortError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout')
  ) {
    return 'network';
  }
  if (e?.status === 401 || msg.includes('jwt') || msg.includes('not authenticated')) return 'auth';
  return 'server';
}

function fail(message: string, cause?: unknown): never {
  if (cause) console.warn('[evidence]', message, cause);
  const kind = classify(cause);
  if (kind === 'network') throw new OfflineError();
  if (kind === 'auth') throw new AuthExpiredError();
  throw new Error(message);
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EVIDENCE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
}

/** Compress + persist a local copy. No network. */
export async function prepareEvidence(image: PendingImage): Promise<PreparedEvidence> {
  const id = newId();
  const compressed = await compressForUpload({
    uri: image.uri,
    width: image.width,
    height: image.height,
  });
  await ensureDir();
  const localUri = `${EVIDENCE_DIR}${id}.jpg`;
  await FileSystem.copyAsync({ from: compressed.uri, to: localUri });
  return {
    id,
    localUri,
    mimeType: 'image/jpeg',
    fileSize: compressed.fileSize,
    isSimulated: image.simulated,
    capturedAt: image.capturedAt,
  };
}

export interface UploadPreparedArgs {
  id: string;
  localUri: string;
  fileSize: number | null;
  isSimulated: boolean;
  capturedAt: string;
  mineId: string;
  inspectionId?: string | null;
  observationId?: string | null;
  incidentId?: string | null;
  correctiveActionId?: string | null;
  uploadedBy: string;
  caption?: string | null;
  location?: { latitude?: number; longitude?: number; accuracy?: number | null } | null;
}

export async function uploadPreparedEvidence(args: UploadPreparedArgs): Promise<EvidenceRow> {
  const parentDir =
    args.incidentId != null
      ? `incidents/${args.incidentId}`
      : args.correctiveActionId != null
        ? `corrective-actions/${args.correctiveActionId}`
        : `${args.inspectionId}/${args.observationId}`;
  const objectKey = `${args.mineId}/${parentDir}/${args.id}.jpg`;

  // 1. bytes from the persistent local copy
  let bytes: ArrayBuffer;
  try {
    bytes = await readAsArrayBuffer(args.localUri);
  } catch (e) {
    fail('The evidence photo could not be read from local storage.', e);
  }

  // 2. Storage upload (idempotent - same key overwrites)
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectKey, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) fail('Could not upload the photo.', upErr);

  // 3. metadata row (idempotent on id)
  const { data, error } = await supabase
    .from('evidence')
    .upsert(
      {
        id: args.id,
        client_ref: args.id,
        evidence_type: 'photo',
        storage_path: objectKey,
        file_name: makeFileName(args.id),
        mime_type: 'image/jpeg',
        file_size_bytes: args.fileSize,
        is_simulated: args.isSimulated,
        caption: args.caption ?? null,
        captured_at: args.capturedAt,
        gps_latitude: args.location?.latitude ?? null,
        gps_longitude: args.location?.longitude ?? null,
        location_accuracy_m: args.location?.accuracy ?? null,
        uploaded_by: args.uploadedBy,
        mine_id: args.mineId,
        inspection_id: args.inspectionId ?? null,
        observation_id: args.observationId ?? null,
        incident_id: args.incidentId ?? null,
        corrective_action_id: args.correctiveActionId ?? null,
        sync_status: 'synced',
      },
      { onConflict: 'id' },
    )
    .select(
      'id, storage_path, file_name, mime_type, file_size_bytes, is_simulated, captured_at, gps_latitude, gps_longitude, created_at',
    )
    .single();
  if (error) fail('The photo uploaded but its record could not be saved.', error);

  // 4. the server has it - drop the local copy
  await FileSystem.deleteAsync(args.localUri, { idempotent: true }).catch(() => {});

  return mapRow(data as Record<string, unknown>);
}

/* --------------------------- voice notes ------------------------------- */

export interface PreparedVoiceNote {
  id: string;
  localUri: string;
  durationMs: number;
  fileSize: number | null;
  capturedAt: string;
}

/** Copy the recording into a persistent app dir. No network. */
export async function prepareVoiceNote(args: {
  uri: string;
  durationMs: number;
  sizeBytes: number | null;
}): Promise<PreparedVoiceNote> {
  const id = newId();
  const info = await FileSystem.getInfoAsync(VOICE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(VOICE_DIR, { intermediates: true });
  const localUri = `${VOICE_DIR}${id}.m4a`;
  await FileSystem.copyAsync({ from: args.uri, to: localUri });
  await FileSystem.deleteAsync(args.uri, { idempotent: true }).catch(() => {});
  return {
    id,
    localUri,
    durationMs: args.durationMs,
    fileSize: args.sizeBytes,
    capturedAt: new Date().toISOString(),
  };
}

export interface UploadVoiceNoteArgs {
  id: string;
  localUri: string;
  durationMs: number;
  fileSize: number | null;
  capturedAt: string;
  mineId: string;
  uploadedBy: string;
  observationId?: string | null;
  incidentId?: string | null;
  correctiveActionId?: string | null;
}

export async function uploadPreparedVoiceNote(args: UploadVoiceNoteArgs): Promise<EvidenceRow> {
  const parentDir =
    args.incidentId != null
      ? `incidents/${args.incidentId}`
      : args.correctiveActionId != null
        ? `corrective-actions/${args.correctiveActionId}`
        : `observations/${args.observationId}`;
  const objectKey = `voice-notes/${args.mineId}/${parentDir}/${args.id}.m4a`;

  let bytes: ArrayBuffer;
  try {
    bytes = await readAsArrayBuffer(args.localUri);
  } catch (e) {
    fail('The voice note could not be read from local storage.', e);
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectKey, bytes, {
    contentType: 'audio/m4a',
    upsert: true,
  });
  if (upErr) fail('Could not upload the voice note.', upErr);

  const { data, error } = await supabase
    .from('evidence')
    .upsert(
      {
        id: args.id,
        client_ref: args.id,
        evidence_type: 'voice_note',
        storage_path: objectKey,
        file_name: `${args.id}.m4a`,
        mime_type: 'audio/m4a',
        file_size_bytes: args.fileSize,
        is_simulated: false,
        caption: `Voice note · ${Math.round(args.durationMs / 1000)}s`,
        captured_at: args.capturedAt,
        uploaded_by: args.uploadedBy,
        mine_id: args.mineId,
        inspection_id: null,
        observation_id: args.observationId ?? null,
        incident_id: args.incidentId ?? null,
        corrective_action_id: args.correctiveActionId ?? null,
        sync_status: 'synced',
      },
      { onConflict: 'id' },
    )
    .select(
      'id, storage_path, file_name, mime_type, file_size_bytes, is_simulated, captured_at, gps_latitude, gps_longitude, created_at',
    )
    .single();
  if (error) fail('The voice note uploaded but its record could not be saved.', error);

  await FileSystem.deleteAsync(args.localUri, { idempotent: true }).catch(() => {});
  return mapRow(data as Record<string, unknown>);
}

export async function listVoiceNotesFor(parent: {
  observationId?: string | null;
  incidentId?: string | null;
  correctiveActionId?: string | null;
}): Promise<EvidenceRow[]> {
  const column =
    parent.incidentId != null
      ? 'incident_id'
      : parent.correctiveActionId != null
        ? 'corrective_action_id'
        : 'observation_id';
  const value = parent.incidentId ?? parent.correctiveActionId ?? parent.observationId;
  if (!value) return [];
  const { data, error } = await supabase
    .from('evidence')
    .select(
      'id, storage_path, file_name, mime_type, file_size_bytes, is_simulated, captured_at, gps_latitude, gps_longitude, created_at, caption',
    )
    .eq(column, value)
    .eq('evidence_type', 'voice_note')
    .order('created_at', { ascending: true });
  if (error) fail('Could not load voice notes.', error);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function deleteEvidence(row: { id: string; storagePath: string }): Promise<void> {
  const { error } = await supabase.from('evidence').delete().eq('id', row.id);
  if (error) fail('Could not remove the evidence.', error);
  await supabase.storage
    .from(BUCKET)
    .remove([row.storagePath])
    .catch(() => {});
}

/** Remove a not-yet-uploaded local evidence file. */
export async function discardPreparedEvidence(localUri: string): Promise<void> {
  await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
}

export async function listEvidence(observationId: string): Promise<EvidenceRow[]> {
  return listEvidenceFor({ observationId });
}

/** List evidence for any parent (observation / incident / corrective action). */
export async function listEvidenceFor(parent: {
  observationId?: string | null;
  incidentId?: string | null;
  correctiveActionId?: string | null;
}): Promise<EvidenceRow[]> {
  const column =
    parent.incidentId != null
      ? 'incident_id'
      : parent.correctiveActionId != null
        ? 'corrective_action_id'
        : 'observation_id';
  const value = parent.incidentId ?? parent.correctiveActionId ?? parent.observationId;
  if (!value) return [];
  const { data, error } = await supabase
    .from('evidence')
    .select(
      'id, storage_path, file_name, mime_type, file_size_bytes, is_simulated, caption, captured_at, gps_latitude, gps_longitude, created_at',
    )
    .eq(column, value)
    .eq('evidence_type', 'photo')
    .order('created_at', { ascending: true });
  if (error) fail('Could not load evidence.', error);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function signedUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

function mapRow(r: Record<string, unknown>): EvidenceRow {
  return {
    id: r.id as string,
    storagePath: r.storage_path as string,
    fileName: (r.file_name as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    fileSizeBytes: (r.file_size_bytes as number) ?? null,
    isSimulated: Boolean(r.is_simulated),
    caption: (r.caption as string) ?? null,
    capturedAt: (r.captured_at as string) ?? null,
    gpsLatitude: (r.gps_latitude as number) ?? null,
    gpsLongitude: (r.gps_longitude as number) ?? null,
    createdAt: r.created_at as string,
  };
}
