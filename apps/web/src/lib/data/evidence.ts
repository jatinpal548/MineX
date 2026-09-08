/**
 * Signed URLs for private evidence objects.
 *
 * The `evidence` Storage bucket is private (0003_storage.sql). We mint short
 * lived signed URLs server-side with the user's own session - the browser never
 * gets a service-role key and never talks to Storage directly.
 */
import { STORAGE_BUCKETS } from '@coalguard/config';
import { createClient } from '@/lib/supabase/server';

const TTL_SECONDS = 60 * 30;

/** Map storage_path -> signed URL (or null if it could not be signed). */
export async function signEvidencePaths(
  paths: string[],
): Promise<Record<string, string | null>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out: Record<string, string | null> = {};
  if (unique.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.evidence)
    .createSignedUrls(unique, TTL_SECONDS);

  if (error || !data) {
    for (const p of unique) out[p] = null;
    return out;
  }

  for (const p of unique) out[p] = null;
  for (const entry of data) {
    if (entry.path) out[entry.path] = entry.error ? null : (entry.signedUrl ?? null);
  }
  return out;
}
